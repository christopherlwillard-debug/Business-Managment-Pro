// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditableWrapper, type EditableWrapperProps } from "./EditableWrapper";

describe("EditableWrapper keyboard activation", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  function mount(onSelect: EditableWrapperProps["onSelect"]) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(createElement(
        EditableWrapper,
        {
          id: "services",
          label: "Services",
          isSelected: false,
          onSelect,
          children: createElement("div", { contentEditable: true, "data-testid": "editable" }, "Our Services"),
        },
      ));
    });
  }

  it("does not intercept Space typed in editable text", () => {
    const onSelect = vi.fn<EditableWrapperProps["onSelect"]>();
    mount(onSelect);
    const editable = host?.querySelector("[data-testid='editable']");
    const space = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });

    act(() => editable?.dispatchEvent(space));

    expect(space.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps Space-to-select when the wrapper itself has focus", () => {
    const onSelect = vi.fn<EditableWrapperProps["onSelect"]>();
    mount(onSelect);
    const wrapper = host?.querySelector("[data-section-canvas-id='services']");
    const space = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });

    act(() => wrapper?.dispatchEvent(space));

    expect(space.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
