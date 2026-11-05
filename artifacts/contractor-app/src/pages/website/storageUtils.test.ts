import { afterEach, describe, expect, it, vi } from "vitest";
import { readEditorPreference, writeEditorPreference } from "./storageUtils";

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
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => { throw new Error("Storage access denied"); }),
        setItem: vi.fn(),
      },
    });

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
