import { describe, expect, it } from "vitest";
import {
  getJobInvoiceActionDestination,
  getJobInvoiceStatusPresentation,
} from "./jobInvoiceStatus";

describe("getJobInvoiceStatusPresentation", () => {
  it("does not call a failed invoice-summary request an unlinked invoice", () => {
    expect(getJobInvoiceStatusPresentation("loading", null)).toEqual({
      label: "Checking invoice status…",
      action: "none",
      actionLabel: null,
    });
    expect(getJobInvoiceStatusPresentation("error", null)).toEqual({
      label: "Invoice status unavailable",
      action: "retry",
      actionLabel: "Retry",
    });
  });

  it("offers creation only after a successful request confirms no invoice", () => {
    expect(getJobInvoiceStatusPresentation("ready", null)).toEqual({
      label: "Not invoiced",
      action: "create",
      actionLabel: "Create Invoice",
    });
  });

  it("maps the existing invoice lifecycle to open/edit and view actions", () => {
    expect(getJobInvoiceStatusPresentation("ready", "draft")).toMatchObject({
      label: "Draft invoice",
      action: "edit",
      actionLabel: "Open / Edit",
    });

    for (const status of ["approved", "sent", "partiallyPaid", "paid"]) {
      expect(getJobInvoiceStatusPresentation("ready", status)).toMatchObject({
        action: "view",
        actionLabel: "View",
      });
    }
  });

  it("treats an unrecognized linked status as an existing invoice", () => {
    expect(getJobInvoiceStatusPresentation("ready", "review_pending")).toMatchObject({
      label: "Review pending",
      action: "view",
      actionLabel: "View",
    });
  });
});

describe("getJobInvoiceActionDestination", () => {
  it("routes new MH Production invoices through the existing production-pricing flow", () => {
    expect(getJobInvoiceActionDestination("mh_production", "create")).toBe("apply-production-pricing");
  });

  it("keeps other workflows and existing draft edits on the invoice review flow", () => {
    expect(getJobInvoiceActionDestination("general_contracting", "create")).toBe("review");
    expect(getJobInvoiceActionDestination("mh_service", "create")).toBe("review");
    expect(getJobInvoiceActionDestination("mh_production", "edit")).toBe("review");
  });

  it("preserves retry and view navigation for every workflow", () => {
    expect(getJobInvoiceActionDestination("mh_production", "retry")).toBe("retry");
    expect(getJobInvoiceActionDestination("mh_production", "view")).toBe("navigate");
  });
});
