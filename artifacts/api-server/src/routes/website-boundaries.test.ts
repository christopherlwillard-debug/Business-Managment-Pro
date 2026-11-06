import { describe, expect, it } from "vitest";
import multer from "multer";
import { applyPublicWebsiteImageSecurityHeaders, getWebsiteMediaUploadError, isTrustedWebsiteLogoObjectPath, getWebsiteRequestBody, normalizeDealerManufacturerIds, normalizePageSlug, parseWebsiteMediaFolderId, validatePageSlugs, validateWebsiteMediaFolderName } from "./website";

describe("website data boundaries", () => {
  it("returns a client error for oversized and malformed media uploads", () => {
    expect(getWebsiteMediaUploadError(new multer.MulterError("LIMIT_FILE_SIZE"))).toEqual({
      status:  413,
      message: "Image exceeds the 20 MB upload limit.",
    });
    expect(getWebsiteMediaUploadError(new multer.MulterError("LIMIT_UNEXPECTED_FILE"))).toEqual({
      status: 400,
      message: "Invalid image upload request. Choose one image file and try again.",
    });
    expect(getWebsiteMediaUploadError(new Error("storage unavailable"))).toBeNull();
  });

  it("adds restrictive headers to every public Website Studio image response", () => {
    const headers = new Map<string, string>();
    applyPublicWebsiteImageSecurityHeaders({
      setHeader: (name, value) => { headers.set(name, value); },
    });
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none';");
  });

  it("normalizes page slugs deterministically", () => {
    expect(normalizePageSlug("  Spring  Special!!! ")).toBe("spring-special");
    expect(normalizePageSlug("A--B")).toBe("a-b");
  });

  it("parses only positive safe media folder IDs", () => {
    expect(parseWebsiteMediaFolderId(undefined)).toBeNull();
    expect(parseWebsiteMediaFolderId(null)).toBeNull();
    expect(parseWebsiteMediaFolderId("")).toBeNull();
    expect(parseWebsiteMediaFolderId("  ")).toBeNull();
    expect(parseWebsiteMediaFolderId("12")).toBe(12);
    expect(parseWebsiteMediaFolderId(12)).toBe(12);
    expect(parseWebsiteMediaFolderId("0")).toBeUndefined();
    expect(parseWebsiteMediaFolderId("-2")).toBeUndefined();
    expect(parseWebsiteMediaFolderId("1.5")).toBeUndefined();
    expect(parseWebsiteMediaFolderId("12abc")).toBeUndefined();
    expect(parseWebsiteMediaFolderId(Number.MAX_SAFE_INTEGER + 1)).toBeUndefined();
  });

  it("validates media folder names against the database's 100-character limit", () => {
    expect(validateWebsiteMediaFolderName("  Job Photos  ")).toEqual({ ok: true, name: "Job Photos" });
    expect(validateWebsiteMediaFolderName("x".repeat(100))).toEqual({ ok: true, name: "x".repeat(100) });
    expect(validateWebsiteMediaFolderName("x".repeat(101))).toEqual({
      ok: false,
      error: "Folder names must be 100 characters or fewer.",
    });
    expect(validateWebsiteMediaFolderName("  ")).toEqual({ ok: false, error: "Folder name is required." });
    expect(validateWebsiteMediaFolderName(42)).toEqual({ ok: false, error: "Folder name must be text." });
    expect(validateWebsiteMediaFolderName("😀".repeat(100))).toEqual({ ok: true, name: "😀".repeat(100) });
    expect(validateWebsiteMediaFolderName("😀".repeat(101))).toEqual({
      ok: false,
      error: "Folder names must be 100 characters or fewer.",
    });
  });

  it("rejects duplicate and home page slugs before persistence", () => {
    const duplicate = validatePageSlugs([
      { id: "one", name: "First", slug: "Offer" },
      { id: "two", name: "Second", slug: "offer" },
    ]);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.conflict.slug).toBe("offer");
      expect(duplicate.error).toContain("already used");
    }

    const home = validatePageSlugs([{ id: "home-copy", name: "Copy", slug: "home" }]);
    expect(home.ok).toBe(false);
  });

  it("returns normalized unique pages for safe persistence", () => {
    const result = validatePageSlugs([{ id: "about", name: "About", slug: " About Us " }]);
    expect(result).toEqual({
      ok: true,
      pages: [{ id: "about", name: "About", slug: "about-us" }],
    });
  });
});
describe("Website Studio page input validation", () => {
  it("rejects malformed pages collections instead of silently preserving them", () => {
    expect(validatePageSlugs({ slug: "about" }).ok).toBe(false);
    expect(validatePageSlugs("about")).toMatchObject({ ok: false, error: "Pages must be provided as a list." });
    expect(validatePageSlugs([null])).toMatchObject({ ok: false, error: "Every page must be a valid page object." });
    expect(validatePageSlugs([["about"]])).toMatchObject({ ok: false, error: "Every page must be a valid page object." });
  });

  it("continues to accept omitted pages and an empty page list", () => {
    expect(validatePageSlugs(undefined)).toEqual({ ok: true, pages: [] });
    expect(validatePageSlugs(null)).toEqual({ ok: true, pages: [] });
    expect(validatePageSlugs([])).toEqual({ ok: true, pages: [] });
  });
});

describe("Website Studio dealer page inputs", () => {
  it("filters unknown IDs and deduplicates manufacturer selections", () => {
    expect(normalizeDealerManufacturerIds([
      "clayton-homes", "cavco", "clayton-homes", "unknown", 42, null,
    ])).toEqual(["clayton-homes", "cavco"]);
  });

  it("returns no manufacturers for malformed input", () => {
    expect(normalizeDealerManufacturerIds("clayton-homes")).toEqual([]);
    expect(normalizeDealerManufacturerIds(null)).toEqual([]);
  });
});

describe("Website Studio page shape validation", () => {
  it("rejects non-text page metadata and malformed nested sections", () => {
    expect(validatePageSlugs([{ slug: 12 }]).ok).toBe(false);
    expect(validatePageSlugs([{ slug: "about", name: { value: "bad" } }]).ok).toBe(false);
    expect(validatePageSlugs([{ slug: "about", id: 12 }]).ok).toBe(false);
    expect(validatePageSlugs([{ slug: "about", sections: {} }]).ok).toBe(false);
    expect(validatePageSlugs([{ slug: "about", sections: [null] }]).ok).toBe(false);
    expect(validatePageSlugs([{ slug: "about", sections: [{ type: "hero", content: [] }] }]).ok).toBe(false);
  });

  it("accepts valid page metadata and section arrays", () => {
    expect(validatePageSlugs([{ id: "about-1", name: "About", slug: "about", sections: [] }])).toMatchObject({
      ok: true,
      pages: [{ id: "about-1", name: "About", slug: "about", sections: [] }],
    });
  });
});

describe("Website Studio request body normalization", () => {
  it("returns an empty record for missing, primitive, or array bodies", () => {
    expect(getWebsiteRequestBody(undefined)).toEqual({});
    expect(getWebsiteRequestBody(null)).toEqual({});
    expect(getWebsiteRequestBody("bad")).toEqual({});
    expect(getWebsiteRequestBody([])).toEqual({});
  });

  it("preserves valid object bodies", () => {
    expect(getWebsiteRequestBody({ sections: [], settings: {} })).toEqual({ sections: [], settings: {} });
  });
});


describe("Website Studio stored logo paths", () => {
  it("accepts only normalized object-storage paths for server-side logo reads", () => {
    expect(isTrustedWebsiteLogoObjectPath("/objects/uploads/business/logo.png")).toBe(true);
    for (const value of ["https://example.com/logo.png", "http://127.0.0.1/logo.png", "/objects/uploads/../secrets", "/objects/uploads/%2e%2e/secrets", "/objects/uploads/logo.png?redirect=http://127.0.0.1", "/objects/uploads\\\\logo.png", null, 42]) {
      expect(isTrustedWebsiteLogoObjectPath(value)).toBe(false);
    }
  });
});
