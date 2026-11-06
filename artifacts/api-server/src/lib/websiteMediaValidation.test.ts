import { describe, expect, it } from "vitest";
import { validateWebsiteMediaPatch } from "./websiteMediaValidation";

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
