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

  it("rolls back only its own preview and preserves later edits", async () => {
    const { restoreSectionBlockStylePreview } = await import("./storageUtils");
    const latest = [
      { id: "hero", content: { headline: "Kept edit" }, blockStyle: { padding: "large", bgImageUrl: "blob:preview" } },
      { id: "about", content: { heading: "Kept too" } },
    ];
    const result = restoreSectionBlockStylePreview(latest, "hero", "blob:preview", { padding: "small", bgColor: "#fff" });
    expect(result[0].content.headline).toBe("Kept edit");
    expect(result[0].blockStyle).toEqual({ padding: "small", bgColor: "#fff" });
    expect(result[1]).toBe(latest[1]);
  });

  it("does not undo a newer background selection when an older upload fails", async () => {
    const { restoreSectionBlockStylePreview } = await import("./storageUtils");
    const latest = [{ id: "hero", blockStyle: { bgImageUrl: "blob:newer" } }];
    expect(restoreSectionBlockStylePreview(latest, "hero", "blob:older", undefined)).toBe(latest);
  });
});
