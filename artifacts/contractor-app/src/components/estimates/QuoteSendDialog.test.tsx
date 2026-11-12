// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteSendDialog } from "./QuoteSendDialog";

describe("QuoteSendDialog manual review gate", () => {
  let container: HTMLDivElement;
  let root: Root;
  let requests: Array<{ url: string; init?: RequestInit }>;
  let sentCount: number;

  beforeEach(() => {
    requests = [];
    sentCount = 0;
    const NativeURL = globalThis.URL;
    class TestURL extends NativeURL {}
    Object.defineProperties(TestURL, {
      createObjectURL: { configurable: true, value: vi.fn(() => "data:text/plain,reviewed-pdf") },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    });
    vi.stubGlobal("URL", TestURL);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes("/quote-preview")) {
        return new Response(JSON.stringify({
          revisionEventId: 71,
          revision: 2,
          title: "Countertops",
          quoteNumber: "Q-2026-000037",
          total: 250,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/quote-events/71/pdf")) {
        return new Response(new Blob(["%PDF-reviewed"], { type: "application/pdf" }), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      }
      if (url.endsWith("/send?businessId=1")) {
        return new Response(JSON.stringify({
          status: "accepted",
          revision: 2,
          eventId: 99,
          message: "Quote accepted by the email provider.",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("does not send until the PDF is loaded, reviewed, and the final button is pressed", async () => {
    await act(async () => root.render(
      <QuoteSendDialog
        estimate={{ id: 37, title: "Countertops", total: 250 }}
        recipient="customer@example.test"
        businessId={1}
        onClose={vi.fn()}
        onSent={() => { sentCount += 1; }}
      />,
    ));
    await flush();

    expect(requests.some(request => request.url.includes("/quote-preview"))).toBe(true);
    expect(requests.some(request => request.url.includes("/send?"))).toBe(false);
    const sendButton = Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent?.trim() === "Send quote") as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    const review = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(review).not.toBeNull();
    await act(async () => {
      review.click();
      await Promise.resolve();
    });
    expect(requests.some(request => request.url.includes("/send?"))).toBe(false);
    expect(sendButton.disabled).toBe(false);

    await act(async () => sendButton.click());
    await flush();

    const sendRequest = requests.find(request => request.url.includes("/send?"));
    expect(sendRequest?.init?.method).toBe("POST");
    expect(JSON.parse(String(sendRequest?.init?.body))).toMatchObject({
      recipient: "customer@example.test",
      revisionEventId: 71,
    });
    expect(sentCount).toBe(1);
  });

  it("shows pricing errors and never enables sending without a valid PDF", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      requests.push({ url: String(input) });
      return new Response(JSON.stringify({
        error: "Customer pricing does not reconcile with the saved estimate.",
      }), { status: 409, headers: { "Content-Type": "application/json" } });
    }));

    await act(async () => root.render(
      <QuoteSendDialog
        estimate={{ id: 37, title: "Countertops", total: 250 }}
        recipient="customer@example.test"
        businessId={1}
        onClose={vi.fn()}
        onSent={() => { sentCount += 1; }}
      />,
    ));
    await flush();

    expect(container.textContent).toContain("Customer pricing does not reconcile");
    expect(Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent?.trim() === "Send quote")?.disabled).toBe(true);
    expect(requests.some(request => request.url.includes("/send?"))).toBe(false);
  });
});
