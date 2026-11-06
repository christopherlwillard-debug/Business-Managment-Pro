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

/** Apply a background-image result only while its own optimistic preview is still current. */
export function completeSectionBlockStyleUpload<T extends { id: string; blockStyle?: Record<string, unknown> }>(
  sections: T[],
  sectionId: string,
  previewUrl: string,
  patch: Record<string, unknown>,
): T[] {
  let changed = false;
  const next = sections.map(section => {
    if (section.id !== sectionId
      || section.blockStyle?.bgImageUrl !== previewUrl
      || section.blockStyle?.bgType !== "image") return section;
    changed = true;
    return { ...section, blockStyle: { ...(section.blockStyle ?? {}), ...patch } };
  });
  return changed ? next : sections;
}

/** Roll back only this upload's optimistic background fields; preserve all concurrent style edits. */
export function restoreSectionBlockStylePreview<T extends { id: string; blockStyle?: Record<string, unknown> }>(
  sections: T[],
  sectionId: string,
  previewUrl: string,
  originalBlockStyle: Record<string, unknown> | undefined,
): T[] {
  let changed = false;
  const next = sections.map(section => {
    if (section.id !== sectionId || section.blockStyle?.bgImageUrl !== previewUrl) return section;
    changed = true;
    const nextStyle = { ...(section.blockStyle ?? {}) };
    if (originalBlockStyle && Object.prototype.hasOwnProperty.call(originalBlockStyle, "bgImageUrl")) {
      nextStyle.bgImageUrl = originalBlockStyle.bgImageUrl;
    } else {
      delete nextStyle.bgImageUrl;
    }
    // A user may have changed the background mode while the upload was in
    // flight. Restore that field only if the temporary preview still owns it.
    if (nextStyle.bgType === "image") {
      if (originalBlockStyle && Object.prototype.hasOwnProperty.call(originalBlockStyle, "bgType")) {
        nextStyle.bgType = originalBlockStyle.bgType;
      } else {
        delete nextStyle.bgType;
      }
    }
    const restored = { ...section } as T;
    if (Object.keys(nextStyle).length > 0) restored.blockStyle = nextStyle;
    else delete restored.blockStyle;
    return restored;
  });
  return changed ? next : sections;
}

/** Update one page using its latest section state, never a pre-upload snapshot. */
export function patchWebsitePageSections<TPage extends { id: string; sections: TSection[] }, TSection>(
  pages: TPage[] | null,
  pageId: string,
  update: (sections: TSection[]) => TSection[],
): TPage[] | null {
  if (!pages) return pages;
  return pages.map(page => page.id === pageId ? { ...page, sections: update(page.sections) } : page);
}

/** Ignore unfinished uploads from a previous business/editor session. */
export function hasPendingWebsiteAssetUploads(pending: Set<string>, session: number): boolean {
  const prefix = `${session}:`;
  for (const key of pending) if (key.startsWith(prefix)) return true;
  return false;
}
