/**
 * Deterministic unit tests for the AI Layout Assistant patch logic.
 * No DB, no HTTP, no OpenAI — all pure-function checks.
 */
import { describe, it, expect } from "vitest";
import {
  condenseSectionsForAI,
  applyContentPatch,
  applyLayoutSuggestion,
  type SectionLike,
} from "../lib/layoutSuggestion";

// ── condenseSectionsForAI ─────────────────────────────────────────────────────

describe("condenseSectionsForAI", () => {
  it("hero: produces correct keys (no minHeight, no gridSize)", () => {
    const result = condenseSectionsForAI([{
      id: "hero", type: "hero", order: 0, enabled: true,
      content: { layout: "split", backgroundImage: "bg.jpg", trustBar: { enabled: true, items: [] } },
    }]);
    expect(result[0]).toMatchObject({ id: "hero", type: "hero", layout: "split", hasBackgroundImage: true, trustBarEnabled: true });
    expect(result[0]).not.toHaveProperty("minHeight");
  });

  it("gallery: uses columns+aspectRatio, not gridSize or layout", () => {
    const result = condenseSectionsForAI([{
      id: "gal", type: "gallery", order: 0, enabled: true,
      content: { columns: 4, aspectRatio: "square", images: [{}, {}, {}] },
    }]);
    expect(result[0]).toMatchObject({ columns: 4, aspectRatio: "square", imageCount: 3 });
    expect(result[0]).not.toHaveProperty("gridSize");
    expect(result[0]).not.toHaveProperty("layout");
  });

  it("service-area: uses valid displayMode values (not all_states / us_map)", () => {
    const result = condenseSectionsForAI([{
      id: "sa", type: "service-area", order: 0, enabled: true,
      content: { displayMode: "selected_only", selectedStates: ["CA", "OR", "WA"] },
    }]);
    expect(result[0]).toMatchObject({ displayMode: "selected_only", stateCount: 3 });
  });

  it("services: correct keys", () => {
    const result = condenseSectionsForAI([{
      id: "svc", type: "services", order: 0, enabled: true,
      content: { columns: 3, items: [{}, {}, {}, {}], layout: "icon_row", hoverLift: true },
    }]);
    expect(result[0]).toMatchObject({ columns: 3, itemCount: 4, layout: "icon_row", hoverLift: true });
  });

  it("excludes disabled sections", () => {
    const sections: SectionLike[] = [
      { id: "a", type: "hero",     order: 0, enabled: true,  content: {} },
      { id: "b", type: "services", order: 1, enabled: false, content: {} },
    ];
    const result = condenseSectionsForAI(sections);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("sorts sections by order", () => {
    const sections: SectionLike[] = [
      { id: "z", type: "footer",  order: 5, enabled: true, content: {} },
      { id: "a", type: "hero",    order: 0, enabled: true, content: {} },
      { id: "m", type: "contact", order: 2, enabled: true, content: {} },
    ];
    const result = condenseSectionsForAI(sections);
    expect(result.map(r => r.id)).toEqual(["a", "m", "z"]);
  });
});

// ── applyContentPatch ─────────────────────────────────────────────────────────

describe("applyContentPatch", () => {
  it("shallow-merges top-level keys", () => {
    const result = applyContentPatch({ columns: 2, hoverLift: false }, { columns: 3, hoverLift: true });
    expect(result).toEqual({ columns: 3, hoverLift: true });
  });

  it("deep-merges trustBar — existing items are preserved when enabling", () => {
    const existing = { trustBar: { enabled: false, items: [{ id: "t1", icon: "✓", label: "Licensed" }] } };
    const result = applyContentPatch(existing, { trustBar: { enabled: true } });
    const tb = result.trustBar as { enabled: boolean; items: unknown[] };
    expect(tb.enabled).toBe(true);
    expect(tb.items).toHaveLength(1); // items preserved
  });

  it("deep-merges secondaryCta — href preserved when enabling", () => {
    const existing = { secondaryCta: { enabled: false, label: "Learn More", href: "/about" } };
    const result = applyContentPatch(existing, { secondaryCta: { enabled: true } });
    const cta = result.secondaryCta as { enabled: boolean; label: string; href: string };
    expect(cta.enabled).toBe(true);
    expect(cta.href).toBe("/about");
    expect(cta.label).toBe("Learn More");
  });

  it("sets whole trustBar object when none exists yet (AI providing defaults)", () => {
    const existing = { layout: "centered" };
    const result = applyContentPatch(existing, { trustBar: { enabled: true, items: [] } });
    expect(result.trustBar).toEqual({ enabled: true, items: [] });
  });

  it("does not deep-merge arrays (replaces)", () => {
    const existing = { items: [1, 2, 3] };
    const result = applyContentPatch(existing, { items: [4, 5] });
    expect(result.items).toEqual([4, 5]);
  });
});

// ── applyLayoutSuggestion ─────────────────────────────────────────────────────

describe("applyLayoutSuggestion", () => {
  const BASE_SECTIONS: SectionLike[] = [
    { id: "hero",     type: "hero",        order: 0, content: { layout: "centered" } },
    { id: "services", type: "services",    order: 1, content: { columns: 2 } },
    { id: "gallery",  type: "gallery",     order: 2, content: { columns: 3, aspectRatio: "auto" } },
    { id: "sa",       type: "service-area", order: 3, content: { displayMode: "both" } },
    { id: "contact",  type: "contact",     order: 4, content: {} },
  ];

  it("applies services columns patch", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, { sectionId: "services", contentPatch: { columns: 3 } });
    expect(result.find(s => s.id === "services")!.content.columns).toBe(3);
    expect(result.find(s => s.id === "hero")!.content.layout).toBe("centered"); // untouched
  });

  it("applies gallery patch with correct keys (columns + aspectRatio)", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, { sectionId: "gallery", contentPatch: { columns: 4, aspectRatio: "square" } });
    const gal = result.find(s => s.id === "gallery")!;
    expect(gal.content.columns).toBe(4);
    expect(gal.content.aspectRatio).toBe("square");
  });

  it("applies service-area displayMode with valid value", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, { sectionId: "sa", contentPatch: { displayMode: "selected_only" } });
    expect(result.find(s => s.id === "sa")!.content.displayMode).toBe("selected_only");
  });

  it("applies hero layout patch", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, { sectionId: "hero", contentPatch: { layout: "split" } });
    expect(result.find(s => s.id === "hero")!.content.layout).toBe("split");
  });

  it("applies blockStylePatch (minHeight) to correct section via blockStylePatch, not contentPatch", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, { sectionId: "hero", blockStylePatch: { minHeight: 75 } });
    expect((result.find(s => s.id === "hero")!.blockStyle as any)?.minHeight).toBe(75);
    expect(result.find(s => s.id === "hero")!.content).not.toHaveProperty("minHeight");
  });

  it("reorders: gallery moved before services produces correct order", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, {
      sectionId: "gallery",
      moveBeforeSectionId: "services",
    });
    const sorted = [...result].sort((a, b) => a.order - b.order);
    const ids = sorted.map(s => s.id);
    expect(ids.indexOf("gallery")).toBeLessThan(ids.indexOf("services"));
  });

  it("reorders: contact moved before gallery changes order correctly", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, {
      sectionId: "contact",
      moveBeforeSectionId: "gallery",
    });
    const sorted = [...result].sort((a, b) => a.order - b.order);
    const ids = sorted.map(s => s.id);
    expect(ids.indexOf("contact")).toBeLessThan(ids.indexOf("gallery"));
  });

  it("no-ops when sectionId not found", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, { sectionId: "nonexistent", contentPatch: { columns: 4 } });
    expect(result).toEqual(BASE_SECTIONS);
  });

  // ── Immutability / undo-safety ──────────────────────────────────────────────

  it("reorder does not mutate original input section objects", () => {
    const original = BASE_SECTIONS.map(s => ({ ...s }));
    const originalOrders = BASE_SECTIONS.map(s => s.order);

    applyLayoutSuggestion(BASE_SECTIONS, {
      sectionId: "gallery",
      moveBeforeSectionId: "services",
    });

    // Input section objects must be unchanged
    BASE_SECTIONS.forEach((s, i) => {
      expect(s.order).toBe(originalOrders[i]);
      expect(s).toEqual(original[i]);
    });
  });

  it("content patch does not mutate original input section objects", () => {
    const originalContent = { ...BASE_SECTIONS.find(s => s.id === "services")!.content };

    applyLayoutSuggestion(BASE_SECTIONS, { sectionId: "services", contentPatch: { columns: 4 } });

    expect(BASE_SECTIONS.find(s => s.id === "services")!.content).toEqual(originalContent);
  });

  it("returned sections are new objects (safe to push to undo history)", () => {
    const result = applyLayoutSuggestion(BASE_SECTIONS, {
      sectionId: "gallery",
      moveBeforeSectionId: "services",
    });

    // Every object in the result must be a fresh reference
    result.forEach((rs, i) => {
      expect(rs).not.toBe(BASE_SECTIONS[i]);
    });
  });
});
