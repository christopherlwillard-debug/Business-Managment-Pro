import { describe, expect, it } from "vitest";
import { applyPublicWebsiteImageSecurityHeaders, normalizePageSlug, parseWebsiteMediaFolderId, validatePageSlugs } from "./website";

describe("website data boundaries", () => {
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