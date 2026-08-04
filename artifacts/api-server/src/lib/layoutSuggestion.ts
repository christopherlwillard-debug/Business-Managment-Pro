/**
 * Pure utility functions for the AI Layout Assistant.
 * No DB, no HTTP — safe to import in tests.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectionLike {
  id: string;
  type: string;
  order: number;
  enabled?: boolean;
  content: Record<string, unknown>;
  blockStyle?: Record<string, unknown>;
}

export interface SuggestionLike {
  sectionId?: string;
  contentPatch?: Record<string, unknown>;
  blockStylePatch?: Record<string, unknown>;
  moveBeforeSectionId?: string;
}

// ── condenseSectionsForAI ─────────────────────────────────────────────────────
// Reduces the section tree to a compact, AI-readable summary.
// Uses ONLY the field names that the actual section components consume.

export function condenseSectionsForAI(sections: SectionLike[]): Record<string, unknown>[] {
  return sections
    .filter(s => s.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(s => {
      const c = s.content;
      const base: Record<string, unknown> = { id: s.id, type: s.type, order: s.order };
      switch (s.type) {
        case "hero":
          return {
            ...base,
            layout: (c.layout as string | undefined) ?? "centered",
            hasBackgroundImage: !!c.backgroundImage,
            trustBarEnabled: !!(c.trustBar as { enabled?: boolean } | undefined)?.enabled,
            secondaryCtaEnabled: !!(c.secondaryCta as { enabled?: boolean } | undefined)?.enabled,
          };
        case "services":
          return {
            ...base,
            columns: (c.columns as number | undefined) ?? 3,
            itemCount: (c.items as unknown[] | undefined ?? []).length,
            layout: (c.layout as string | undefined) ?? "cards",
            hoverLift: !!c.hoverLift,
          };
        case "gallery":
          // ImageGallerySection uses: columns (2|3|4), aspectRatio ("square"|"video"|"auto")
          return {
            ...base,
            columns: (c.columns as number | undefined) ?? 3,
            aspectRatio: (c.aspectRatio as string | undefined) ?? "auto",
            imageCount: (c.images as unknown[] | undefined ?? []).length,
          };
        case "portfolio":
          return {
            ...base,
            projectCount: (c.projects as unknown[] | undefined ?? []).length,
          };
        case "footer":
          return {
            ...base,
            hasPhone: !!c.phone,
            hasEmail: !!c.email,
            hasAddress: !!c.address,
            hasLicense: !!c.licenseNumber,
          };
        case "service-area":
          // ServiceAreaSection displayMode: "map"|"list"|"both"|"selected_only"
          return {
            ...base,
            stateCount: (c.selectedStates as unknown[] | undefined ?? []).length,
            displayMode: (c.displayMode as string | undefined) ?? "both",
          };
        case "stats":
          return {
            ...base,
            columns: c.columns,
            itemCount: ((c.items ?? c.stats) as unknown[] | undefined ?? []).length,
          };
        case "certifications":
          return { ...base, itemCount: (c.items as unknown[] | undefined ?? []).length };
        case "testimonials":
          return {
            ...base,
            itemCount: ((c.items ?? c.testimonials) as unknown[] | undefined ?? []).length,
          };
        case "before-after":
          return { ...base, pairCount: (c.pairs as unknown[] | undefined ?? []).length };
        default:
          return base;
      }
    });
}

// ── applyContentPatch ─────────────────────────────────────────────────────────
// Shallow-merges patch into existing content, but deep-merges known nested
// objects (trustBar, secondaryCta, badge) so the AI can toggle a feature
// without wiping user-customized sub-fields.

const DEEP_MERGE_KEYS = new Set(["trustBar", "secondaryCta", "badge"]);

export function applyContentPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (
      DEEP_MERGE_KEYS.has(k) &&
      existing[k] != null &&
      typeof existing[k] === "object" &&
      !Array.isArray(existing[k]) &&
      typeof v === "object" && v !== null && !Array.isArray(v)
    ) {
      result[k] = {
        ...(existing[k] as Record<string, unknown>),
        ...(v as Record<string, unknown>),
      };
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── applyLayoutSuggestion ─────────────────────────────────────────────────────
// Pure function: applies a suggestion to a sections array and returns the
// mutated copy. Used in tests and mirrors the WebsiteEditor apply handler.

export function applyLayoutSuggestion(
  sections: SectionLike[],
  suggestion: SuggestionLike,
): SectionLike[] {
  // 1. Apply content/blockStyle patch to the target section
  let newSections: SectionLike[] = sections.map(sec => {
    if (sec.id !== suggestion.sectionId) return sec;
    return {
      ...sec,
      content: suggestion.contentPatch
        ? applyContentPatch(sec.content, suggestion.contentPatch)
        : sec.content,
      blockStyle: suggestion.blockStylePatch
        ? { ...(sec.blockStyle ?? {}), ...suggestion.blockStylePatch }
        : sec.blockStyle,
    };
  });

  // 2. Move sectionId to immediately before moveBeforeSectionId
  if (suggestion.moveBeforeSectionId && suggestion.sectionId) {
    const sorted = [...newSections].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex(s => s.id === suggestion.sectionId);
    const toIdx   = sorted.findIndex(s => s.id === suggestion.moveBeforeSectionId);
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const [moved] = sorted.splice(fromIdx, 1);
      const insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx;
      sorted.splice(insertAt, 0, moved);
      // Reassign order immutably — never mutate objects from the input array
      newSections = sorted.map((s, i) => ({ ...s, order: i }));
    }
  }

  return newSections;
}
