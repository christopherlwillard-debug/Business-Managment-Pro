// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialListsQueryState } from "./MaterialListsQueryState";

describe("MaterialListsQueryState", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderState(props: Partial<React.ComponentProps<typeof MaterialListsQueryState>> = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MaterialListsQueryState
          isLoading={false}
          isError={false}
          isSuccess={true}
          isFetching={false}
          hasLists={false}
          onRetry={vi.fn()}
          emptyState={<p>No material lists yet</p>}
          {...props}
        >
          <p>Saved list</p>
        </MaterialListsQueryState>,
      );
    });
  }

  it("shows an error and retry action instead of the empty state after a failed request", async () => {
    const onRetry = vi.fn();
    await renderState({ isError: true, isSuccess: false, onRetry });

    expect(container.querySelector('[data-testid="material-lists-load-error"]')).not.toBeNull();
    expect(container.textContent).toContain("Couldn’t load material lists");
    expect(container.textContent).not.toContain("No material lists yet");

    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the empty state only after a successful empty response", async () => {
    await renderState({ isSuccess: true });

    expect(container.textContent).toContain("No material lists yet");
    expect(container.querySelector('[data-testid="material-lists-load-error"]')).toBeNull();
  });

  it("keeps previously loaded lists visible alongside a refresh error", async () => {
    await renderState({ isError: true, isSuccess: false, hasLists: true });

    expect(container.querySelector('[data-testid="material-lists-load-error"]')).not.toBeNull();
    expect(container.textContent).toContain("Saved list");
    expect(container.textContent).not.toContain("No material lists yet");
  });
});
