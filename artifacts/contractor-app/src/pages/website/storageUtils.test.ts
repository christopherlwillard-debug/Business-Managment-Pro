import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelWebsiteRenameBlurCommit, consumeWebsiteRenameBlurCommit, getPublicSiteQueryKey, getSafePublicNavLinks, getSafeWebsiteHref, partitionWebsiteMediaFiles, readEditorPreference, removeWebsitePageAndNavigationLinks, resolvePublicSitePageRoute, waitForWebsiteSaveQueue, withWebsitePageList, writeEditorPreference } from "./storageUtils";





describe("Website Studio public navigation safety", () => {
  it("rejects unsafe and malformed navigation destinations", () => {
    expect(getSafeWebsiteHref("javascript:void")).toBeNull();
    expect(getSafeWebsiteHref("//attacker.example/path")).toBeNull();
    expect(getSafeWebsiteHref("data:text/html,unsafe")).toBeNull();
    expect(getSafeWebsiteHref("java\\tscript:unsafe")).toBeNull();
    expect(getSafeWebsiteHref("  /services  ")).toBe("/services");
    expect(getSafeWebsiteHref("#contact")).toBe("#contact");
    expect(getSafeWebsiteHref("https://example.com")).toBe("https://example.com");
    expect(getSafeWebsiteHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
  });

  it("filters malformed nav entries and creates stable IDs when missing", () => {
    expect(getSafePublicNavLinks([
      { id: "home", label: "Home", href: "/" },
      { label: "Services", href: "/services" },
      { id: "bad", label: "Unsafe", href: "javascript:void" },
      { id: "empty", label: " ", href: "/empty" },
      null,
      "not-an-object",
    ])).toEqual([
      { id: "home", label: "Home", href: "/" },
      { id: "nav-link-1", label: "Services", href: "/services" },
    ]);
    expect(getSafePublicNavLinks({ navLinks: [] })).toEqual([]);
  });

  it("maps page-backed links to custom-domain paths using current page slugs", () => {
    expect(getSafePublicNavLinks([
      { id: "about-link", label: "About", href: "/site/demo/old-about", pageId: "page-about" },
      { id: "contact-link", label: "Contact", href: "/site/demo/contact", pageId: "page-contact" },
      { id: "anchor-link", label: "Contact section", href: "#contact" },
      { id: "external-link", label: "External", href: "https://example.com" },
    ], {
      pages: [
        { id: "page-about", slug: "about-us" },
        { id: "page-contact", slug: "contact" },
      ],
      businessSlug: "demo",
      customDomain: true,
    })).toEqual([
      { id: "about-link", label: "About", href: "/about-us" },
      { id: "contact-link", label: "Contact", href: "/contact" },
      { id: "anchor-link", label: "Contact section", href: "#contact" },
      { id: "external-link", label: "External", href: "https://example.com" },
    ]);
  });

  it("builds app-hosted links from the current page slug after a rename", () => {
    expect(getSafePublicNavLinks([
      { id: "about-link", label: "About Us", href: "/site/demo/about", pageId: "page-about" },
    ], {
      pages: [{ id: "page-about", slug: "about-us" }],
      businessSlug: "demo",
    })).toEqual([
      { id: "about-link", label: "About Us", href: "/site/demo/about-us" },
    ]);
  });

  it("omits stale page-backed links when the referenced page no longer exists", () => {
    expect(getSafePublicNavLinks([
      { id: "stale-link", label: "Old page", href: "/site/demo/old-page", pageId: "deleted-page" },
    ], {
      pages: [],
      businessSlug: "demo",
      customDomain: true,
    })).toEqual([]);
  });
});

describe("Website Studio rename blur handling", () => {
  it("commits once when Enter moves focus away from a rename field", () => {
    const shouldCommitOnBlur = { current: true };
    expect(consumeWebsiteRenameBlurCommit(shouldCommitOnBlur)).toBe(true);
    expect(consumeWebsiteRenameBlurCommit(shouldCommitOnBlur)).toBe(false);
  });

  it("does not commit when Escape cancels a rename", () => {
    const shouldCommitOnBlur = { current: true };
    cancelWebsiteRenameBlurCommit(shouldCommitOnBlur);
    expect(shouldCommitOnBlur.current).toBe(false);
    expect(consumeWebsiteRenameBlurCommit(shouldCommitOnBlur)).toBe(false);
  });
});

describe("Website Studio public page cache", () => {
  it("uses distinct cache keys for the home page and each custom page", () => {
    const home = getPublicSiteQueryKey("sample-business", undefined, false, "example.com");
    const about = getPublicSiteQueryKey("sample-business", "about", false, "example.com");
    const contact = getPublicSiteQueryKey("sample-business", "contact", false, "example.com");
    expect(new Set([JSON.stringify(home), JSON.stringify(about), JSON.stringify(contact)]).size).toBe(3);
  });

  it("keeps host-based and draft-preview pages isolated", () => {
    const published = getPublicSiteQueryKey(undefined, "about", false, "example.com");
    const preview = getPublicSiteQueryKey(undefined, "about", true, "example.com");
    const otherHost = getPublicSiteQueryKey(undefined, "about", false, "other.example");
    expect(new Set([JSON.stringify(published), JSON.stringify(preview), JSON.stringify(otherHost)]).size).toBe(3);
  });
});

describe("Website Studio custom-domain page routing", () => {
  it("resolves custom-domain root and one-segment page paths", () => {
    expect(resolvePublicSitePageRoute(undefined, undefined, "/")).toEqual({ invalidPath: false });
    expect(resolvePublicSitePageRoute(undefined, undefined, "/about")).toEqual({
      pageSlug: "about",
      invalidPath: false,
    });
    expect(resolvePublicSitePageRoute(undefined, undefined, "/About-Us/")).toEqual({
      pageSlug: "about-us",
      invalidPath: false,
    });
    expect(resolvePublicSitePageRoute(undefined, undefined, "/about%2Dus")).toEqual({
      pageSlug: "about-us",
      invalidPath: false,
    });
  });

  it("preserves explicit app-hosted business and page route parameters", () => {
    expect(resolvePublicSitePageRoute("sample-business", undefined, "/site/sample-business")).toEqual({
      invalidPath: false,
    });
    expect(resolvePublicSitePageRoute("sample-business", "about", "/site/sample-business/about")).toEqual({
      pageSlug: "about",
      invalidPath: false,
    });
  });

  it("rejects malformed and nested custom-domain paths instead of treating them as home", () => {
    expect(resolvePublicSitePageRoute(undefined, undefined, "/about/team")).toEqual({ invalidPath: true });
    expect(resolvePublicSitePageRoute(undefined, undefined, "/%2e%2e")).toEqual({ invalidPath: true });
    expect(resolvePublicSitePageRoute(undefined, undefined, "/bad%2Fslug")).toEqual({ invalidPath: true });
    expect(resolvePublicSitePageRoute(undefined, undefined, "/bad%ZZ")).toEqual({ invalidPath: true });
    expect(resolvePublicSitePageRoute(undefined, undefined, "/about.html")).toEqual({ invalidPath: true });
  });
});

describe("Website Studio media file selection", () => {
  it("reports known non-image files and lets the server inspect unknown MIME types", () => {
    const image = { name: "photo.jpg", type: "image/jpeg" };
    const unknown = { name: "phone-photo", type: "" };
    const document = { name: "invoice.pdf", type: "application/pdf" };
    expect(partitionWebsiteMediaFiles([image, unknown, document])).toEqual({
      uploadable: [image, unknown],
      unsupported: [document],
    });
  });

  it("returns unsupported files instead of silently dropping an all-invalid selection", () => {
    const document = { name: "invoice.pdf", type: "application/pdf" };
    expect(partitionWebsiteMediaFiles([document])).toEqual({
      uploadable: [],
      unsupported: [document],
    });
  });
});

describe("Website Studio custom page persistence", () => {
  it("explicitly clears the last deleted custom page instead of retaining stale settings", () => {
    const settings = { brandColor: "#123456", pages: [{ id: "about", slug: "about" }] };
    expect(withWebsitePageList(settings, [])).toEqual({ brandColor: "#123456", pages: [] });
  });

  it("persists the current page list while preserving unrelated settings", () => {
    const settings = { brandColor: "#123456", customDomain: "example.com", pages: [{ id: "old" }] };
    const pages = [{ id: "new", slug: "contact" }];
    expect(withWebsitePageList(settings, pages)).toEqual({
      brandColor: "#123456", customDomain: "example.com", pages,
    });
  });
});

describe("Website Studio page deletion", () => {
  it("removes the selected page and its header link without changing other pages", () => {
    const pages = [
      {
        id: "home",
        sections: [
          {
            id: "header",
            type: "header",
            content: {
              navLinks: [
                { id: "about-link", pageId: "about", href: "/site/demo/about" },
                { id: "contact-link", pageId: "contact", href: "/site/demo/contact" },
                { id: "external-link", href: "https://example.com" },
              ],
            },
          },
          { id: "hero", type: "hero", content: { headline: "Home" } },
        ],
      },
      { id: "about", sections: [] },
      { id: "contact", sections: [] },
    ];

    const result = removeWebsitePageAndNavigationLinks(pages, "about");

    expect(result.map(page => page.id)).toEqual(["home", "contact"]);
    expect(result[0].sections[0].content.navLinks).toEqual([
      { id: "contact-link", pageId: "contact", href: "/site/demo/contact" },
      { id: "external-link", href: "https://example.com" },
    ]);
    expect(result[0].sections[1]).toBe(pages[0].sections[1]);
    expect(result[1]).toBe(pages[2]);
  });

  it("does not crash on malformed header links and never removes the home page", () => {
    const pages = [
      { id: "home", sections: [{ id: "header", type: "header", content: { navLinks: { pageId: "about" } } }] },
      { id: "about", sections: [] },
    ];

    expect(removeWebsitePageAndNavigationLinks(pages, "home")).toBe(pages);
    const result = removeWebsitePageAndNavigationLinks(pages, "about");
    expect(result.map(page => page.id)).toEqual(["home"]);
    expect(result[0].sections[0].content.navLinks).toEqual([]);
  });
});

describe("Website Studio preference storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a saved preference when browser storage is available", () => {
    const getItem = vi.fn(() => "mobile");
    vi.stubGlobal("window", { localStorage: { getItem, setItem: vi.fn() } });

    expect(readEditorPreference("website-editor-viewport")).toBe("mobile");
    expect(getItem).toHaveBeenCalledWith("website-editor-viewport");
  });

  it("returns null when browser storage cannot be read", () => {
    const blockedWindow = Object.defineProperty({}, "localStorage", {
      get() { throw new Error("Storage access denied"); },
    });
    vi.stubGlobal("window", blockedWindow);

    expect(readEditorPreference("website-editor-viewport")).toBeNull();
  });

  it("writes a saved preference when browser storage is available", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem: vi.fn(), setItem } });

    writeEditorPreference("website-editor-viewport", "tablet");

    expect(setItem).toHaveBeenCalledWith("website-editor-viewport", "tablet");
  });

  it("does not throw when browser storage writes are blocked", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(() => { throw new Error("Storage quota exceeded"); }),
      },
    });

    expect(() => writeEditorPreference("website-editor-viewport", "tablet")).not.toThrow();
  });
});

describe("Website Studio save queue", () => {
  it("waits for an in-flight save and the newer queued snapshot", async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    let inFlight = true;
    let queued = true;
    let pending: Promise<void> | null = new Promise<void>(resolve => { finishFirst = resolve; });

    const startQueuedSave = () => {
      inFlight = true;
      pending = new Promise<void>(resolve => { finishSecond = resolve; });
      void pending.then(() => { inFlight = false; });
    };

    const first = pending;
    void first!.then(() => {
      inFlight = false;
      if (queued) {
        queued = false;
        startQueuedSave();
      }
    });

    const drained = waitForWebsiteSaveQueue({
      isInFlight: () => inFlight,
      isQueued: () => queued,
      getPending: () => pending,
      flushQueued: () => {
        queued = false;
        startQueuedSave();
      },
    });

    finishFirst();
    await Promise.resolve();
    expect(inFlight).toBe(true);
    expect(queued).toBe(false);

    finishSecond();
    await drained;

    expect(inFlight).toBe(false);
    expect(queued).toBe(false);
  });

  it("starts a queued save when the queue has no active promise", async () => {
    let queued = true;
    let inFlight = false;
    let finish!: () => void;
    let pending: Promise<void> | null = null;

    const drained = waitForWebsiteSaveQueue({
      isInFlight: () => inFlight,
      isQueued: () => queued,
      getPending: () => pending,
      flushQueued: () => {
        queued = false;
        inFlight = true;
        pending = new Promise<void>(resolve => { finish = resolve; });
        void pending.then(() => { inFlight = false; });
      },
    });

    expect(inFlight).toBe(true);
    expect(queued).toBe(false);
    finish();
    await drained;
    expect(inFlight).toBe(false);
  });
});


describe("Website Studio background image upload state", () => {
  it("merges the uploaded image into the latest section without discarding other edits", async () => {
    const { patchSectionBlockStyle } = await import("./storageUtils");
    const latest = [
      { id: "hero", content: { headline: "Edited while uploading" }, blockStyle: { padding: "large", bgImageUrl: "blob:preview" } },
      { id: "about", content: { heading: "Also edited" } },
    ];
    const result = patchSectionBlockStyle(latest, "hero", {
      bgImageObjectPath: "/objects/uploads/website-section-bgs/id",
      bgImageUrl: "/api/public/site/demo/section-bg/id",
      bgType: "image",
    });
    expect(result[0].content.headline).toBe("Edited while uploading");
    expect(result[0].blockStyle).toEqual({
      padding: "large",
      bgImageObjectPath: "/objects/uploads/website-section-bgs/id",
      bgImageUrl: "/api/public/site/demo/section-bg/id",
      bgType: "image",
    });
    expect(result[1]).toBe(latest[1]);
  });

  it("rolls back only its own background fields and preserves concurrent style edits", async () => {
    const { restoreSectionBlockStylePreview } = await import("./storageUtils");
    const latest = [
      { id: "hero", content: { headline: "Kept edit" }, blockStyle: {
        padding: "large", marginTop: 24, bgImageUrl: "blob:preview", bgType: "image",
        bgImageObjectPath: "/objects/old-image",
      } },
      { id: "about", content: { heading: "Kept too" } },
    ];
    const result = restoreSectionBlockStylePreview(latest, "hero", "blob:preview", {
      padding: "small", bgColor: "#fff", bgImageUrl: "/old-image", bgType: "image",
    });
    expect(result[0].content.headline).toBe("Kept edit");
    expect(result[0].blockStyle).toEqual({
      padding: "large", marginTop: 24, bgImageUrl: "/old-image", bgType: "image",
      bgImageObjectPath: "/objects/old-image",
    });
    expect(result[1]).toBe(latest[1]);
  });

  it("finalizes the uploaded URL without overriding a background mode change", async () => {
    const { completeSectionBlockStyleUpload, restoreSectionBlockStylePreview } = await import("./storageUtils");
    const latest = [{ id: "hero", blockStyle: { bgImageUrl: "blob:preview", bgType: "gradient", bgColor: "#123456" } }];
    const completed = completeSectionBlockStyleUpload(latest, "hero", "blob:preview", {
      bgImageUrl: "/uploaded-image", bgImageObjectPath: "/objects/uploaded-image",
    });
    expect(completed[0].blockStyle).toEqual({
      bgImageUrl: "/uploaded-image", bgImageObjectPath: "/objects/uploaded-image",
      bgType: "gradient", bgColor: "#123456",
    });
    const rolledBack = restoreSectionBlockStylePreview(latest, "hero", "blob:preview", {
      bgImageUrl: "/previous-image", bgType: "image",
    });
    expect(rolledBack[0].blockStyle).toEqual({
      bgImageUrl: "/previous-image", bgType: "gradient", bgColor: "#123456",
    });
  });

  it("does not replace a newer background when an older upload succeeds", async () => {
    const { completeSectionBlockStyleUpload } = await import("./storageUtils");
    const latest = [{ id: "hero", blockStyle: { bgImageUrl: "blob:newer", bgType: "image" } }];
    expect(completeSectionBlockStyleUpload(latest, "hero", "blob:older", {
      bgImageUrl: "/older-image", bgImageObjectPath: "/objects/older-image",
    })).toBe(latest);
  });

  it("updates the target page from its latest sections only", async () => {
    const { patchWebsitePageSections } = await import("./storageUtils");
    const pages = [
      { id: "home", sections: [{ id: "hero", content: { headline: "Latest" } }] },
      { id: "about", sections: [{ id: "about", content: { body: "Keep" } }] },
    ];
    const result = patchWebsitePageSections(pages, "home", sections =>
      sections.map(section => ({ ...section, content: { ...section.content, imageUrl: "/new-image" } })),
    );
    expect(result?.[0].sections[0].content).toEqual({ headline: "Latest", imageUrl: "/new-image" });
    expect(result?.[1]).toBe(pages[1]);
  });

  it("ignores pending uploads from a different business session", async () => {
    const { hasPendingWebsiteAssetUploads } = await import("./storageUtils");
    const pending = new Set(["3:upload-a", "4:upload-b"]);
    expect(hasPendingWebsiteAssetUploads(pending, 3)).toBe(true);
    expect(hasPendingWebsiteAssetUploads(pending, 4)).toBe(true);
    expect(hasPendingWebsiteAssetUploads(pending, 5)).toBe(false);
  });

  it("does not undo a newer background selection when an older upload fails", async () => {
    const { restoreSectionBlockStylePreview } = await import("./storageUtils");
    const latest = [{ id: "hero", blockStyle: { bgImageUrl: "blob:newer" } }];
    expect(restoreSectionBlockStylePreview(latest, "hero", "blob:older", undefined)).toBe(latest);
  });
});

describe("page-scoped section content updates", () => {
  it("does not update a different page when section IDs collide", async () => {
    const { patchWebsitePageSectionContent } = await import("./storageUtils");
    const pages = [
      { id: "home", sections: [{ id: "shared", content: { headline: "Home" } }] },
      { id: "about", sections: [{ id: "shared", content: { headline: "About" } }] },
    ];
    const result = patchWebsitePageSectionContent(pages, "about", "shared", { headline: "Updated About" });
    expect(result?.[0].sections[0].content).toEqual({ headline: "Home" });
    expect(result?.[1].sections[0].content).toEqual({ headline: "Updated About" });
  });

  it("leaves other pages and missing sections unchanged", async () => {
    const { patchWebsitePageSectionContent } = await import("./storageUtils");
    const pages = [{ id: "home", sections: [{ id: "hero", content: { headline: "Home" } }] }];
    expect(patchWebsitePageSectionContent(pages, "missing", "hero", {})).toBe(pages);
    expect(patchWebsitePageSectionContent(pages, "home", "missing", {})).toBe(pages);
  });
});
