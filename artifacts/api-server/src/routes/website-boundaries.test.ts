import { describe, expect, it } from "vitest";
import multer from "multer";
import { applyPublicWebsiteImageSecurityHeaders, getWebsiteMediaUploadError, getWebsiteMediaStorageFilename, isTrustedWebsiteLogoObjectPath, isWebsiteMediaObjectKey, isWebsiteStoredObjectPath, getWebsiteRequestBody, ensureUniqueWebsiteSectionIds, normalizeDealerManufacturerIds, normalizePageSlug, normalizeSections, getWebsitePageList, getWebsiteSectionList, getWebsiteSectionTextItems, getWebsiteStringList, getWebsiteSocialLinks, getWebsiteWorkingHours, hasWebsitePortfolioPhoto, getWebsiteSitemapPages, escapeWebsiteXml, getSafeWebsiteCustomDomain, buildSitemapXml, buildManifest, escapeWebsiteEmailHtml, getWebsiteContactText, getSafeWebsiteSubmissionFields, parseWebsiteMoneyCents, getEnabledWebsiteDepositSection, parseWebsiteMediaFolderId, validatePageSlugs, validateWebsiteMediaFolderName, websiteRouter } from "./website";


describe("Website Studio route registration", () => {
  it("registers only one section-regeneration handler so the client contract is reachable", () => {
    const handlers = (websiteRouter as any).stack.filter(
      (layer: any) => layer.route?.path === "/regenerate-section" && layer.route.methods.post,
    );
    expect(handlers).toHaveLength(1);
  });
});



describe("Website Studio public contact form boundaries", () => {
  it("accepts only bounded text values and trims whitespace", () => {
    expect(getWebsiteContactText("  Customer  ")).toBe("Customer");
    expect(getWebsiteContactText({ value: "bad" })).toBeUndefined();
    expect(getWebsiteContactText("x".repeat(120), 100)).toHaveLength(100);
    expect(getWebsiteContactText("   ")).toBeUndefined();
  });

  it("filters malformed custom fields and caps entry count, labels, and values", () => {
    const manyFields = Object.fromEntries(Array.from({ length: 35 }, (_, index) => ["Field " + index, "value"]));
    const fields = getSafeWebsiteSubmissionFields({
      "  Name  ": "  Chris  ",
      ["x".repeat(120)]: "label too long",
      Invalid: { nested: true },
      Empty: "   ",
      ...manyFields,
    });
    expect(fields.Name).toBe("Chris");
    expect(fields.Invalid).toBeUndefined();
    expect(fields.Empty).toBeUndefined();
    expect(Object.keys(fields).length).toBeLessThanOrEqual(30);
    expect(Object.values(fields).every(value => typeof value === "string" && value.length <= 5000)).toBe(true);
  });
});

describe("Website Studio contact email escaping", () => {
  it("escapes untrusted field labels and values before HTML email rendering", () => {
    expect(escapeWebsiteEmailHtml("<img src=x onerror=alert(1)>")).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(escapeWebsiteEmailHtml("A & B \"quoted\" 'text'")).toBe("A &amp; B &quot;quoted&quot; &#39;text&#39;");
    expect(escapeWebsiteEmailHtml(null)).toBe("");
  });
});

describe("Website Studio deposit validation", () => {
  it("parses only positive finite USD amounts with at most two decimal places", () => {
    expect(parseWebsiteMoneyCents(250)).toBe(25000);
    expect(parseWebsiteMoneyCents("250.5")).toBe(25050);
    expect(parseWebsiteMoneyCents("0.01")).toBe(1);
    for (const value of ["10junk", "1e3", "1.001", "-5", "0", "", "  ", Infinity, NaN, {}, [], true, Number.MAX_SAFE_INTEGER]) {
      expect(parseWebsiteMoneyCents(value)).toBeNull();
    }
  });

  it("ignores malformed or disabled deposit sections", () => {
    expect(getEnabledWebsiteDepositSection(null)).toBeNull();
    expect(getEnabledWebsiteDepositSection({ type: "deposit" })).toBeNull();
    expect(getEnabledWebsiteDepositSection([
      null,
      { type: "deposit", enabled: true, content: null },
      { type: "deposit", enabled: false, content: { amount: 50 } },
      { type: "deposit", enabled: true, content: { amount: 75 } },
    ])).toEqual({ content: { amount: 75 } });
  });
});

describe("Website Studio persisted section boundaries", () => {
  it("filters malformed section records and normalizes invalid nested content", () => {
    expect(getWebsiteSectionList(null)).toEqual([]);
    expect(getWebsiteSectionList([
      null,
      "hero",
      { type: 42, content: {} },
      { type: "hero", content: [] },
      { type: "services", content: { items: [{ title: "Trim" }] } },
    ])).toEqual([
      { type: "hero", content: {} },
      { type: "services", content: { items: [{ title: "Trim" }] } },
    ]);
  });

  it("extracts only valid titled service items", () => {
    expect(getWebsiteSectionTextItems([
      null, "service", [], { title: 42 }, { title: "  Sealing  " }, { title: "" },
    ])).toEqual([{ title: "Sealing" }]);
    expect(getWebsiteSectionTextItems({ title: "not an array" })).toEqual([]);
  });

  it("safely checks portfolio photos in malformed legacy and current data", () => {
    const objectPath = "/objects/uploads/website-portfolio-photos/550e8400-e29b-41d4-a716-446655440000";
    expect(hasWebsitePortfolioPhoto(null, objectPath)).toBe(false);
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: { projects: [null, { photos: [null, { photoObjectPath: objectPath }] }] } }], objectPath)).toBe(true);
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: { photos: "bad" } }], objectPath)).toBe(false);
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: { photos: [{ photoObjectPath: objectPath }] } }], "https://example.com/image.png")).toBe(false);
  });
});

describe("Website Studio public manifest safety", () => {
  it("uses safe defaults for malformed settings and ignores unsafe logo URLs", () => {
    const biz = { name: "Example Business", slug: "example-business" };
    const empty = buildManifest(biz, null);
    expect(empty.theme_color).toBe("#1a1a2e");
    expect(empty.background_color).toBe("#1a1a2e");
    expect(empty.icons).toEqual([{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]);
    const unsafe = buildManifest(biz, { logoUrl: "javascript:alert(1)", brandColor: "red" });
    expect(unsafe.theme_color).toBe("#1a1a2e");
    expect(unsafe.icons).toHaveLength(1);
  });

  it("keeps safe relative and HTTPS logo URLs", () => {
    const relative = buildManifest({ name: "Site", slug: "site" }, { logoUrl: "/logo.png", brandColor: "#123abc" });
    expect(relative.theme_color).toBe("#123abc");
    expect(relative.icons).toHaveLength(2);
    const remote = buildManifest({ name: "Site", slug: "site" }, { logoUrl: "https://cdn.example.com/logo.png" });
    expect(remote.icons).toHaveLength(2);
    const malformed = buildManifest({ name: "Site", slug: "site" }, { logoUrl: "/\\\\evil.example/logo.png" });
    expect(malformed.icons).toHaveLength(1);
  });
});

describe("Website Studio sitemap safety", () => {
  it("filters and normalizes persisted sitemap page slugs", () => {
    expect(getWebsiteSitemapPages([
      null,
      { slug: 42 },
      { slug: "  About Us! " },
      { slug: "home" },
      { slug: "<script>alert(1)</script>" },
    ])).toEqual([{ slug: "about-us", name: "about-us" }, { slug: "scriptalert1script", name: "scriptalert1script" }]);
  });

  it("escapes XML text and rejects non-host custom domain values", () => {
    expect(escapeWebsiteXml("<site & 'name'>")).toBe("&lt;site &amp; &apos;name&apos;&gt;");
    expect(getSafeWebsiteCustomDomain(" Example.COM. ")).toBe("example.com");
    for (const value of ["https://example.com", "example.com/path", "evil.com\\r\\nInjected: yes", "localhost", null]) {
      expect(getSafeWebsiteCustomDomain(value)).toBeNull();
    }
  });

  it("normalizes sitemap slugs before serializing XML", () => {
    const xml = buildSitemapXml("https://example.com", [{ slug: "../private", name: "Private" }, { slug: "About Us", name: "About" }]);
    expect(xml).toContain("https://example.com/about-us");
    expect(xml).not.toContain("../private");
  });
});

describe("Website Studio portfolio photo lookup", () => {
  const path = "/objects/uploads/website-portfolio-photos/550e8400-e29b-41d4-a716-446655440000";

  it("finds photos in current project galleries and legacy galleries", () => {
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: {
      projects: [{ photos: [{ photoObjectPath: path }] }],
    } }], path)).toBe(true);
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: {
      photos: [{ photoObjectPath: path }],
    } }], path)).toBe(true);
  });

  it("returns false for malformed sections, projects, photo lists, and unsafe paths", () => {
    expect(hasWebsitePortfolioPhoto(null, path)).toBe(false);
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: {
      projects: [null, "bad", { photos: null }, { photos: [{ photoObjectPath: 42 }] }],
    } }], path)).toBe(false);
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: { projects: {} } }], path)).toBe(false);
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: { photos: [null, []] } }], path)).toBe(false);
    expect(hasWebsitePortfolioPhoto([{ type: "portfolio", content: { photos: [{ photoObjectPath: path }] } }], "/objects/uploads/other/" + path.split("/").pop())).toBe(false);
  });
});

describe("Website Studio profile data normalization", () => {
  it("filters and bounds service-area strings from malformed saved settings", () => {
    expect(getWebsiteStringList(["  Kentucky  ", "", 42, null, "Illinois"], 2)).toEqual(["Kentucky", "Illinois"]);
    expect(getWebsiteStringList({ areas: ["Kentucky"] })).toEqual([]);
    expect(getWebsiteStringList(["x".repeat(200)], 10, 80)).toEqual(["x".repeat(80)]);
  });

  it("keeps only valid HTTP social links and bounds their count", () => {
    expect(getWebsiteSocialLinks([
      { platform: "Facebook", url: "https://facebook.com/example" },
      null,
      { platform: "Unsafe", url: "javascript:alert(1)" },
      { platform: 42, url: "https://example.com" },
      { platform: "No URL", url: [] },
    ])).toEqual([{ platform: "Facebook", url: "https://facebook.com/example" }]);
    expect(getWebsiteSocialLinks("bad")).toEqual([]);
  });

  it("normalizes hours rows without throwing on malformed entries", () => {
    expect(getWebsiteWorkingHours([
      { day: "Monday", open: "8:00 AM", close: "5:00 PM", closed: false },
      null,
      "Tuesday",
      { day: 42, open: "9", close: "5", closed: false },
      { day: "Tuesday", open: 9, close: null, closed: "yes" },
    ])).toEqual([
      { day: "Monday", open: "8:00 AM", close: "5:00 PM", closed: false },
      { day: "Tuesday", open: "", close: "", closed: false },
    ]);
    expect(getWebsiteWorkingHours({ hours: [] })).toEqual([]);
  });
});

describe("Website Studio public page list recovery", () => {
  it("returns an empty list for missing or malformed persisted page settings", () => {
    expect(getWebsitePageList(undefined)).toEqual([]);
    expect(getWebsitePageList(null)).toEqual([]);
    expect(getWebsitePageList({ slug: "about" })).toEqual([]);
    expect(getWebsitePageList("about")).toEqual([]);
  });

  it("filters malformed entries before public route slug lookups", () => {
    expect(getWebsitePageList([
      null,
      "about",
      [],
      { slug: 42 },
      { id: "valid", slug: "about" },
      { id: "also-valid", slug: "contact" },
    ])).toEqual([
      { id: "valid", slug: "about" },
      { id: "also-valid", slug: "contact" },
    ]);
  });
});

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
    expect(parseWebsiteMediaFolderId(true)).toBeUndefined();
    expect(parseWebsiteMediaFolderId([12])).toBeUndefined();
    expect(parseWebsiteMediaFolderId([])).toBeUndefined();
    expect(parseWebsiteMediaFolderId(null)).toBeNull();
    expect(parseWebsiteMediaFolderId("")).toBeNull();
    expect(parseWebsiteMediaFolderId("1e2")).toBeUndefined();
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
    expect(isTrustedWebsiteLogoObjectPath("/objects/uploads/website-logos/550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    for (const value of ["https://example.com/logo.png", "http://127.0.0.1/logo.png", "/objects/uploads/../secrets", "/objects/uploads/%2e%2e/secrets", "/objects/uploads/logo.png?redirect=http://127.0.0.1", "/objects/uploads\\\\logo.png", null, 42]) {
      expect(isTrustedWebsiteLogoObjectPath(value)).toBe(false);
    }
  });
});

describe("Website Studio section identity", () => {
  it("repairs missing and duplicate section IDs without changing unique IDs", () => {
    expect(ensureUniqueWebsiteSectionIds([
      { id: "hero", type: "hero" },
      { id: "hero", type: "hero" },
      { type: "services" },
      { id: "footer", type: "footer" },
    ])).toEqual([
      { id: "hero", type: "hero" },
      { id: "hero-2", type: "hero" },
      { id: "services-3", type: "services" },
      { id: "footer", type: "footer" },
    ]);
  });

  it("also normalizes duplicate IDs in saved sections before the editor receives them", () => {
    const result = normalizeSections([
      { id: "duplicate", type: "hero", content: { headline: "One" } },
      { id: "duplicate", type: "text", content: { body: "Two" } },
    ]);
    expect(result[0].id).toBe("duplicate");
    expect(result[1].id).toBe("duplicate-2");
    expect(new Set(result.map(section => section.id)).size).toBe(result.length);
  });

  it("normalizes duplicate IDs inside custom pages before persistence", () => {
    const result = validatePageSlugs([{
      id: "about",
      name: "About",
      slug: "about",
      sections: [
        { id: "duplicate", type: "hero", content: {} },
        { id: "duplicate", type: "text", content: {} },
      ],
    }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.pages[0].sections as Array<{ id: string }>).map(section => section.id)).toEqual(["duplicate", "duplicate-2"]);
    }
  });
});

describe("Website Studio section normalization", () => {
  it("falls back to defaults when saved sections are missing or malformed", () => {
    expect(normalizeSections(null).length).toBeGreaterThan(0);
    expect(normalizeSections({}).length).toBeGreaterThan(0);
  });

  it("filters malformed saved sections and normalizes invalid metadata", () => {
    const result = normalizeSections([
      null,
      { type: "hero", content: { headline: "Welcome" }, order: "bad", enabled: "yes" },
      { type: "broken", content: [] },
    ]);
    expect(result[0]).toMatchObject({
      id: "section-0", type: "hero", enabled: true, order: 0,
      content: { headline: "Welcome" },
    });
    expect(result.every(section => typeof section.type === "string" && !!section.content)).toBe(true);
  });
});


describe("Website Studio media storage filenames", () => {
  it("uses a fixed safe filename extension derived from detected image bytes", () => {
    expect(getWebsiteMediaStorageFilename("image/jpeg")).toBe("website-media.jpg");
    expect(getWebsiteMediaStorageFilename("image/svg+xml")).toBe("website-media.svg");
    expect(getWebsiteMediaStorageFilename("image/avif")).toBe("website-media.avif");
    expect(getWebsiteMediaStorageFilename("image/webp")).toBe("website-media.webp");
    expect(getWebsiteMediaStorageFilename("../../etc/passwd")).toBe("website-media.img");
  });
});


describe("Website Studio public image identifiers", () => {
  it("accepts generated UUID keys with safe image extensions", () => {
    expect(isWebsiteMediaObjectKey("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isWebsiteMediaObjectKey("550e8400-e29b-41d4-a716-446655440000.jpg")).toBe(true);
  });

  it("rejects path traversal, encoded paths, and arbitrary object names", () => {
    for (const value of ["../private", "%2e%2e", "550e8400-e29b-41d4-a716-446655440000/../../secret", "550e8400-e29b-41d4-a716-446655440000.svg?x=1", "not-a-uuid", null, 42]) {
      expect(isWebsiteMediaObjectKey(value)).toBe(false);
    }
  });
});


describe("Website Studio stored public object paths", () => {
  it("accepts only UUID objects from the requested upload namespace", () => {
    const path = "/objects/uploads/website-favicons/550e8400-e29b-41d4-a716-446655440000";
    expect(isWebsiteStoredObjectPath(path, "/objects/uploads/website-favicons/")).toBe(true);
    expect(isWebsiteStoredObjectPath(path, "/objects/uploads/website-about-photos/")).toBe(false);
    for (const value of [
      "/objects/uploads/website-favicons/../private",
      "/objects/uploads/website-favicons/%2e%2e",
      "/objects/uploads/website-favicons/550e8400-e29b-41d4-a716-446655440000/extra",
      "https://example.com/favicon.ico",
      null,
    ]) {
      expect(isWebsiteStoredObjectPath(value, "/objects/uploads/website-favicons/")).toBe(false);
    }
  });
});
