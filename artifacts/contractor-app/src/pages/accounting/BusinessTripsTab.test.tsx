// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessTripsTab from "./BusinessTripsTab";

const queryHarness = vi.hoisted(() => ({
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: true,
    refetch: queryHarness.refetch,
  }),
}));

describe("Business Trips request state", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryHarness.refetch.mockReset();
    act(() => {
      root.render(<BusinessTripsTab year={2026} />);
    });
  });

  it("shows a failed report instead of the empty state and retries without a mutation", () => {
    const errorState = container.querySelector('[data-testid="status-business-trips-error"]');
    expect(errorState?.textContent).toContain("Business trips could not be loaded");
    expect(errorState?.textContent).toContain("totals may be incomplete");
    expect(container.textContent).not.toContain("No business trips for 2026");

    const retry = container.querySelector('[data-testid="button-retry-business-trips"]') as HTMLButtonElement;
    act(() => retry.click());
    expect(queryHarness.refetch).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
});