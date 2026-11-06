import { afterEach, describe, expect, it, vi } from "vitest";
import { readEditorPreference, waitForWebsiteSaveQueue, writeEditorPreference } from "./storageUtils";

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
