// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicePanel } from "./InvoicePanel";

const harness = vi.hoisted(() => ({
  refreshBusinesses: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListClients: () => ({ data: [] }),
  useListJobs: () => ({ data: [] }),
  useGetSettings: () => ({
    data: {
      companyName: "Shared Company",
      invoiceLogoPosition: "top-left",
      invoiceLogoSize: "small",
    },
  }),
  useCreateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateClient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateInvoicePaymentLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteInvoicePaymentLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListInvoiceCommunications: () => ({ data: [] }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

vi.mock("@/contexts/GoogleAuth", () => ({
  useGoogleAuth: () => ({
    isConfigured: false,
    isConnected: false,
    getToken: vi.fn(),
    signIn: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: harness.toast }),
}));

vi.mock("@/contexts/BusinessContext", () => ({
  useBusiness: () => ({
    activeBusiness: null,
    businesses: [
      {
        id: 17,
        name: "Asphalt",
        slug: "asphalt_sealing",
        logoUrl: "/logos/asphalt.png",
        invoiceLogoLayout: { x: 0.8, width: 240, height: 90 },
      },
      {
        id: 23,
        name: "General",
        slug: "general_contracting",
        logoUrl: "/logos/general.png",
        invoiceLogoLayout: { x: 0.25, width: 180, height: 70 },
      },
    ],
    refresh: harness.refreshBusinesses,
  }),
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("InvoicePanel logo layout editing", () => {
  let container: HTMLDivElement;
  let root: Root;
  let resetSucceeds: boolean;
  let requests: Array<{ url: string; init?: RequestInit }>;

  beforeEach(async () => {
    resetSucceeds = true;
    requests = [];
    harness.toast.mockReset();
    harness.refreshBusinesses.mockReset();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes("/api/settings/logo-data-uri")) {
        return new Response(JSON.stringify({ dataUri: "data:image/png;base64,bG9nbw==" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/businesses/17") && init?.method === "PUT") {
        return new Response(null, { status: resetSucceeds ? 200 : 500 });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <InvoicePanel
          open
          onOpenChange={vi.fn()}
          initialData={{ businessLine: "asphalt_sealing" } as never}
        />,
      );
    });
    await flush();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function enterLayoutModeAndReset() {
    const logo = container.querySelector('[data-invoice-logo]') as HTMLDivElement;
    expect(logo).not.toBeNull();
    expect(logo.style.left).toBe("80%");
    expect(logo.style.width).toBe("240px");

    act(() => logo.click());
    const reset = Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent?.trim() === "Reset to default") as HTMLButtonElement;
    expect(reset).not.toBeUndefined();
    await act(async () => reset.click());
    await flush();
  }

  async function enterLayoutModeAndResize() {
    const logo = container.querySelector('[data-invoice-logo]') as HTMLDivElement;
    expect(logo).not.toBeNull();
    expect(logo.style.width).toBe("240px");
    expect(logo.style.height).toBe("90px");

    act(() => logo.click());
    const resizeHandle = container.querySelector(
      'button[aria-label="Resize logo"]',
    ) as HTMLButtonElement;
    expect(resizeHandle).not.toBeNull();

    act(() => {
      resizeHandle.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 0,
        clientY: 0,
      }));
      window.dispatchEvent(new PointerEvent("pointermove", {
        clientX: 40,
        clientY: 0,
      }));
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(logo.style.width).toBe("280px");
    expect(logo.style.height).toBe("105px");
  }

  it("clears only the selected business, previews the shared fallback, and exits layout mode", async () => {
    await enterLayoutModeAndReset();

    const resetRequest = requests.find(request => request.url.endsWith("/api/businesses/17"));
    expect(resetRequest).toMatchObject({
      url: "/api/businesses/17",
      init: {
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ invoiceLogoLayout: null }),
      },
    });
    expect(requests.some(request => request.url.endsWith("/api/businesses/23"))).toBe(false);
    expect(container.textContent).not.toContain("Reset to default");
    expect(container.querySelector("[data-invoice-logo-guides]")).toBeNull();

    const logo = container.querySelector('[data-invoice-logo]') as HTMLDivElement;
    expect(logo.style.left).toBe("0%");
    expect(logo.style.width).toBe("120px");
    expect(harness.refreshBusinesses).toHaveBeenCalledTimes(1);
  });

  it("preserves the current draft and shows an error when reset fails", async () => {
    resetSucceeds = false;
    await enterLayoutModeAndReset();

    expect(container.textContent).toContain("Reset to default");
    expect(container.querySelector("[data-invoice-logo-guides]")).not.toBeNull();
    const logo = container.querySelector('[data-invoice-logo]') as HTMLDivElement;
    expect(logo.style.left).toBe("80%");
    expect(logo.style.width).toBe("240px");
    expect(harness.refreshBusinesses).not.toHaveBeenCalled();
    expect(harness.toast).toHaveBeenCalledWith({
      title: "Logo layout not reset",
      description: "Could not reset logo layout",
      variant: "destructive",
    });
  });

  it("saves the edited layout only to the selected business, refreshes branding, and exits layout mode", async () => {
    await enterLayoutModeAndResize();

    const done = Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent?.trim() === "Done") as HTMLButtonElement;
    expect(done).not.toBeUndefined();
    await act(async () => done.click());
    await flush();

    const saveRequest = requests.find(request => request.url.endsWith("/api/businesses/17"));
    expect(saveRequest).toMatchObject({
      url: "/api/businesses/17",
      init: {
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({
          invoiceLogoLayout: { x: 0.8, width: 280, height: 105 },
        }),
      },
    });
    expect(requests.some(request => request.url.endsWith("/api/businesses/23"))).toBe(false);
    expect(container.textContent).not.toContain("Done");
    expect(container.querySelector("[data-invoice-logo-guides]")).toBeNull();
    expect(harness.refreshBusinesses).toHaveBeenCalledTimes(1);
  });

  it("cancels the draft when switching businesses and cannot save it to the newly selected business", async () => {
    await enterLayoutModeAndResize();

    const generalBusiness = Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent?.trim() === "General") as HTMLButtonElement;
    expect(generalBusiness).not.toBeUndefined();

    await act(async () => generalBusiness.click());
    await flush();

    expect(container.textContent).not.toContain("Done");
    expect(container.querySelector("[data-invoice-logo-guides]")).toBeNull();
    expect(requests.some(request =>
      request.init?.method === "PUT"
      && (
        request.url.endsWith("/api/businesses/17")
        || request.url.endsWith("/api/businesses/23")
      )
    )).toBe(false);
  });

  it("preserves the edited draft in layout mode and shows a destructive error when save fails", async () => {
    resetSucceeds = false;
    await enterLayoutModeAndResize();

    const done = Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent?.trim() === "Done") as HTMLButtonElement;
    expect(done).not.toBeUndefined();
    await act(async () => done.click());
    await flush();

    expect(container.textContent).toContain("Done");
    expect(container.querySelector("[data-invoice-logo-guides]")).not.toBeNull();
    const logo = container.querySelector('[data-invoice-logo]') as HTMLDivElement;
    expect(logo.style.width).toBe("280px");
    expect(logo.style.height).toBe("105px");
    expect(harness.refreshBusinesses).not.toHaveBeenCalled();
    expect(harness.toast).toHaveBeenCalledWith({
      title: "Logo layout not saved",
      description: "Could not save logo layout",
      variant: "destructive",
    });
  });
});
