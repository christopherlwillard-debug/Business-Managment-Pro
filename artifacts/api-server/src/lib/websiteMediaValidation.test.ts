import { describe, expect, it } from "vitest";
import { truncateWebsiteMediaFilename, validateWebsiteAnalysisInput, validateWebsiteMediaIds, validateWebsiteMediaPatch, validateWebsiteSections, validateWebsiteSettings } from "./websiteMediaValidation";

describe("validateWebsiteMediaPatch", () => {
  it("accepts valid metadata and folder updates", () => {
    expect(validateWebsiteMediaPatch({ displayName: "Front elevation", alt: "New home exterior", folderId: 12 })).toEqual({
      ok: true,
      update: { displayName: "Front elevation", alt: "New home exterior", folderId: 12 },
    });
  });

  it("allows clearing optional text and removing a folder", () => {
    expect(validateWebsiteMediaPatch({ displayName: "", alt: null, folderId: null })).toEqual({
      ok: true, update: { displayName: null, alt: null, folderId: null },
    });
  });

  it("rejects non-object payloads and empty updates", () => {
    expect(validateWebsiteMediaPatch(null).ok).toBe(false);
    expect(validateWebsiteMediaPatch([]).ok).toBe(false);
    expect(validateWebsiteMediaPatch({}).ok).toBe(false);
  });

  it("rejects non-string display names and alt text instead of throwing", () => {
    expect(validateWebsiteMediaPatch({ displayName: { value: "bad" } })).toEqual({
      ok: false, error: "Display name must be text or null.",
    });
    expect(validateWebsiteMediaPatch({ alt: 42 })).toEqual({
      ok: false, error: "Alt text must be text or null.",
    });
  });

  it("rejects text longer than the database varchar columns", () => {
    expect(validateWebsiteMediaPatch({ displayName: "x".repeat(256) }).ok).toBe(false);
    expect(validateWebsiteMediaPatch({ alt: "x".repeat(256) }).ok).toBe(false);
    expect(validateWebsiteMediaPatch({ alt: "😀".repeat(256) }).ok).toBe(false);
  });

  it("rejects invalid folder IDs", () => {
    for (const folderId of [0, -1, 1.5, "12", Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateWebsiteMediaPatch({ folderId }).ok).toBe(false);
    }
  });
});
describe("validateWebsiteMediaIds", () => {
  it("accepts positive integer IDs and removes duplicates", () => {
    expect(validateWebsiteMediaIds([3, 8, 3])).toEqual({ ok: true, ids: [3, 8] });
  });

  it("rejects missing, empty, oversized, or malformed ID lists", () => {
    expect(validateWebsiteMediaIds(undefined).ok).toBe(false);
    expect(validateWebsiteMediaIds([]).ok).toBe(false);
    expect(validateWebsiteMediaIds(Array.from({ length: 1001 }, (_, i) => i + 1)).ok).toBe(false);
    for (const ids of [[0], [-1], [1.5], ["3"], [Number.MAX_SAFE_INTEGER + 1]]) {
      expect(validateWebsiteMediaIds(ids).ok).toBe(false);
    }
  });
});

describe("truncateWebsiteMediaFilename", () => {
  it("keeps filenames within the database limit without splitting Unicode characters", () => {
    expect([...truncateWebsiteMediaFilename("x".repeat(300))]).toHaveLength(255);
    expect([...truncateWebsiteMediaFilename("😀".repeat(300))]).toHaveLength(255);
    expect(truncateWebsiteMediaFilename("photo.jpg", 5)).toBe("photo");
  });
});

describe("Website Studio direct upload validation", () => {
  const valid = { name: "background.webp", size: 1024, contentType: "image/webp" };

  it("accepts supported image uploads and normalizes content types", async () => {
    const { validateWebsiteDirectUpload } = await import("./websiteMediaValidation");
    expect(validateWebsiteDirectUpload({ ...valid, contentType: "IMAGE/WEBP" }, "image")).toEqual({
      ok: true,
      upload: { ...valid, contentType: "image/webp" },
    });
  });

  it("rejects missing, malformed, empty, and oversized uploads", async () => {
    const { validateWebsiteDirectUpload } = await import("./websiteMediaValidation");
    for (const input of [null, [], {}, { ...valid, size: 0 }, { ...valid, size: -1 }, { ...valid, size: 20 * 1024 * 1024 + 1 }, { ...valid, name: " " }, { ...valid, contentType: "text/html" }]) {
      expect(validateWebsiteDirectUpload(input, "image").ok).toBe(false);
    }
    expect(validateWebsiteDirectUpload({ ...valid, size: 2 * 1024 * 1024 + 1 }, "favicon").ok).toBe(false);
  });

  it("restricts favicon types to browser icon formats", async () => {
    const { validateWebsiteDirectUpload } = await import("./websiteMediaValidation");
    expect(validateWebsiteDirectUpload({ ...valid, contentType: "image/jpeg" }, "favicon").ok).toBe(false);
    expect(validateWebsiteDirectUpload({ ...valid, contentType: "image/png" }, "favicon").ok).toBe(true);
    expect(validateWebsiteDirectUpload({ ...valid, contentType: "image/x-icon" }, "favicon").ok).toBe(true);
  });

  it("rejects filenames beyond the database-safe limit", async () => {
    const { validateWebsiteDirectUpload } = await import("./websiteMediaValidation");
    expect(validateWebsiteDirectUpload({ ...valid, name: "x".repeat(256) }, "image").ok).toBe(false);
  });
});

describe("Website Studio analysis input validation", () => {
  const validSection = { type: "hero", enabled: true, content: { headline: "Welcome" } };

  it("accepts valid section and settings payloads", () => {
    expect(validateWebsiteAnalysisInput([validSection], { brandColor: "#123456" }).ok).toBe(true);
    expect(validateWebsiteAnalysisInput([], {}).ok).toBe(true);
  });

  it("rejects malformed arrays, section records, content, and settings", () => {
    for (const [sections, settings] of [
      ["not-an-array", {}],
      [[null], {}],
      [[{ ...validSection, type: 12 }], {}],
      [[{ ...validSection, content: null }], {}],
      [[{ ...validSection, content: [] }], {}],
      [[validSection], null],
      [[validSection], []],
      [[validSection], "bad"],
    ] as Array<[unknown, unknown]>) {
      expect(validateWebsiteAnalysisInput(sections, settings).ok).toBe(false);
    }
  });
});

describe("Website Studio configuration validation", () => {
  it("accepts valid section and settings structures", () => {
    expect(validateWebsiteSections([{ id: "hero", type: "hero", enabled: true, content: {} }]).ok).toBe(true);
    expect(validateWebsiteSections([]).ok).toBe(true);
    expect(validateWebsiteSettings({ brandColor: "#123456" }).ok).toBe(true);
  });

  it("rejects malformed sections before they can be persisted", () => {
    for (const value of [null, {}, "bad", [null], [[]], [{ type: "hero", content: {} }], [{ type: "", content: {} }], [{ type: "hero", content: [] }], [{ type: "hero", content: {}, enabled: "yes" }]]) {
      expect(validateWebsiteSections(value).ok).toBe(false);
    }
  });

  it("rejects primitive and array settings payloads", () => {
    for (const value of [null, [], "bad", 12, true]) {
      expect(validateWebsiteSettings(value).ok).toBe(false);
    }
  });
});

describe("Website Studio media reference protection", () => {
  it("counts URL references across nested website data", () => {
    const data = {
      sections: [{ content: { photoUrl: "/media/1", items: [{ imageUrl: "/media/1" }] } }],
      settings: { logoUrl: "/media/1" },
    };
    expect(countWebsiteMediaUrlReferences(data, "/media/1")).toBe(3);
  });

  it("returns zero for missing URLs and safely handles empty data", () => {
    expect(countWebsiteMediaUrlReferences(null, "/media/1")).toBe(0);
    expect(countWebsiteMediaUrlReferences({ url: "/media/1" }, "")).toBe(0);
  });
});

describe("saved Website Studio section validation", () => {
  it("accepts and normalizes valid saved sections", () => {
    expect(validateSavedWebsiteSection({
      name: "  Hero  ", sectionType: "hero", content: { headline: "Welcome" }, blockStyle: null,
    })).toEqual({
      ok: true, section: { name: "Hero", sectionType: "hero", content: { headline: "Welcome" }, blockStyle: null },
    });
  });

  it("rejects malformed names, types, content, and styles", () => {
    for (const value of [
      null, [], {}, { name: {}, sectionType: "hero", content: {} },
      { name: "x".repeat(256), sectionType: "hero", content: {} },
      { name: "Hero", sectionType: {}, content: {} },
      { name: "Hero", sectionType: "hero", content: [] },
      { name: "Hero", sectionType: "hero", content: {}, blockStyle: [] },
    ]) expect(validateSavedWebsiteSection(value).ok).toBe(false);
  });

  it("accepts only positive safe database IDs", () => {
    expect(parsePositiveDatabaseId("12")).toBe(12);
    for (const value of ["12junk", "1.5", "1e2", 0, -1, true, [1], Number.MAX_SAFE_INTEGER + 1, null]) {
      expect(parsePositiveDatabaseId(value)).toBe(null);
    }
  });
});
