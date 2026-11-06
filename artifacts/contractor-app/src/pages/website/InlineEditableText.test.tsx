// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineEditableText } from "./InlineEditableText";
import { InlineEditContext, type InlineEditContextValue } from "./InlineEditContext";

describe("InlineEditableText keyboard activation", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  it("keeps the Space activation key from reaching the canvas shortcut listener", () => {
    const startEditing = vi.fn();
    const context: InlineEditContextValue = {
      editingId: null,
      selectedId: "headline",
      draft: "",
      enterBehavior: "newline",
      escapeBehavior: "commit",
      startEditing,
      updateDraft: vi.fn(),
      commitEdit: vi.fn(),
      cancelEdit: vi.fn(),
      moveToNext: vi.fn(),
      setCommitBoundaryCallback: vi.fn(),
      selectElement: vi.fn(),
      deselectAll: vi.fn(),
    };

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(createElement(
        InlineEditContext.Provider,
        { value: context },
        createElement(InlineEditableText, {
          id: "headline",
          value: "My headline",
          onCommit: vi.fn(),
        }),
      ));
    });

    const canvasShortcut = vi.fn();
    window.addEventListener("keydown", canvasShortcut);
    try {
      const activation = new KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        host?.querySelector("[data-inline-editable='headline']")?.dispatchEvent(activation);
      });

      expect(activation.defaultPrevented).toBe(true);
      expect(startEditing).toHaveBeenCalledOnce();
      expect(canvasShortcut).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", canvasShortcut);
    }
  });
});
