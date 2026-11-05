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
