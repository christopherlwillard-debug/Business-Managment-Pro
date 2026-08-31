import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceDeliveryHistory } from "./InvoiceDeliveryHistory";
import type { InvoiceCommunicationEvent } from "@workspace/api-client-react";

const event: InvoiceCommunicationEvent = {
  id: 1,
  invoiceId: 42,
  eventType: "initial_invoice",
  channel: "gmail",
  provider: "gmail",
  status: "accepted",
  requestedAt: "2026-08-24T10:30:00.000Z",
  completedAt: "2026-08-24T10:30:01.000Z",
  source: "user",
  recipient: "client@example.com",
  subject: "Invoice INV-100",
  providerMessageId: "gmail-message-1",
  createdAt: "2026-08-24T10:30:00.000Z",
};

describe("InvoiceDeliveryHistory", () => {
  it("renders a chronological event timeline with provider metadata", () => {
    const markup = renderToStaticMarkup(InvoiceDeliveryHistory({
      invoiceNumber: "INV-100",
      events: [event],
    }));

    expect(markup).toContain("Communication &amp; delivery");
    expect(markup).toContain("Invoice sent");
    expect(markup).toContain("Accepted by provider");
    expect(markup).toContain("client@example.com");
    expect(markup).toContain("gmail-message-1");
  });

  it("renders loading and empty states safely", () => {
    const loadingMarkup = renderToStaticMarkup(InvoiceDeliveryHistory({
      invoiceNumber: "INV-101",
      events: [],
      isLoading: true,
    }));
    const emptyMarkup = renderToStaticMarkup(InvoiceDeliveryHistory({
      invoiceNumber: "INV-102",
      events: [],
    }));

    expect(loadingMarkup).toContain("Loading history");
    expect(emptyMarkup).toContain("No invoice communications recorded yet.");
  });
});