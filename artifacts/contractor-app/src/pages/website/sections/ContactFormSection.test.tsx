// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactFormSection } from "./ContactFormSection";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function responseWithMessage(message: string): Response {
  return {
    ok: true,
    json: async () => [{
      id: 1,
      submittedAt: "2026-11-06T00:00:00.000Z",
      fields: { Message: message },
    }],
  } as Response;
}

describe("ContactFormSection submissions business isolation", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    vi.unstubAllGlobals();
  });

  function renderSection(businessId?: number) {
    act(() => {
      root?.render(createElement(ContactFormSection, {
        content: { heading: "Contact", subheading: "", serviceTypes: [], fields: [] },
        settings: { brandColor: "#123456" },
        isEditing: true,
        businessId,
      }));
    });
  }

  function mount(businessId?: number) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    renderSection(businessId);
  }

  function openSubmissions() {
    const button = Array.from(host?.querySelectorAll("button") ?? [])
      .find(item => item.textContent?.includes("Submissions"));
    expect(button).toBeTruthy();
    act(() => button?.click());
  }

  it("ignores a late response from the previous business after switching", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal as AbortSignal);
      return String(input).includes("businessId=1") ? first.promise : second.promise;
    });
    vi.stubGlobal("fetch", fetchMock);

    mount(1);
    openSubmissions();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    renderSection(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      second.resolve(responseWithMessage("Business B submission"));
      await second.promise;
    });
    expect(host?.textContent).toContain("Business B submission");

    await act(async () => {
      first.resolve(responseWithMessage("Business A private submission"));
      await first.promise;
      await Promise.resolve();
    });

    expect(host?.textContent).toContain("Business B submission");
    expect(host?.textContent).not.toContain("Business A private submission");
  });

  it("clears submissions when the business context is removed", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);

    mount(1);
    openSubmissions();
    await act(async () => {
      pending.resolve(responseWithMessage("Previous business submission"));
      await pending.promise;
    });
    expect(host?.textContent).toContain("Previous business submission");

    renderSection(undefined);
    expect(host?.textContent).not.toContain("Previous business submission");
    expect(host?.textContent).toContain("No submissions yet.");
  });
});
