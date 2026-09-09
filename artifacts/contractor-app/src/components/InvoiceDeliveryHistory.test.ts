import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatInvoiceCommunicationTimestamp,
  InvoiceDeliveryHistory,
  sortReminderTimestamps,
} from "./InvoiceDeliveryHistory";
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

  it("formats reminder history in a configured local timezone", () => {
    expect(formatInvoiceCommunicationTimestamp(
      "2026-09-02T01:15:00.000Z",
      "America/Chicago",
    )).toBe("Sep 1, 2026, 08:15 PM");
  });

  it("keeps multiple reminder timestamps ordered and readable", () => {
    const timestamps = sortReminderTimestamps([
      "2026-09-02T15:45:00.000Z",
      "2026-09-01T13:30:00.000Z",
      "2026-09-02T09:05:00.000Z",
    ]);

    expect(timestamps).toEqual([
      "2026-09-01T13:30:00.000Z",
      "2026-09-02T09:05:00.000Z",
      "2026-09-02T15:45:00.000Z",
    ]);
    expect(timestamps.map(timestamp =>
      formatInvoiceCommunicationTimestamp(timestamp, "America/Chicago"),
    )).toEqual([
      "Sep 1, 2026, 08:30 AM",
      "Sep 2, 2026, 04:05 AM",
      "Sep 2, 2026, 10:45 AM",
    ]);
  });

  it("renders communication events in chronological order", () => {
    const laterEvent = {
      ...event,
      id: 2,
      eventType: "manual_reminder",
      requestedAt: "2026-08-25T10:30:00.000Z",
      createdAt: "2026-08-25T10:30:00.000Z",
      providerMessageId: "later-message",
    } satisfies InvoiceCommunicationEvent;
    const markup = renderToStaticMarkup(InvoiceDeliveryHistory({
      events: [laterEvent, event],
    }));

    expect(markup.indexOf("gmail-message-1")).toBeLessThan(markup.indexOf("later-message"));
  });

  it("puts the existing Gmail recovery action on the matching pending event", () => {
    const pendingEvent = {
      ...event,
      status: "pending",
      completedAt: null,
      providerMessageId: null,
    } satisfies InvoiceCommunicationEvent;
    const markup = renderToStaticMarkup(InvoiceDeliveryHistory({
      events: [pendingEvent],
      onRepairGmail: () => undefined,
    }));

    expect(markup).toContain("Find Sent Email &amp; Repair");
  });

  it("does not offer pending-message recovery for an accepted event", () => {
    const acceptedWithoutEvidence = {
      ...event,
      providerMessageId: null,
    } satisfies InvoiceCommunicationEvent;
    const markup = renderToStaticMarkup(InvoiceDeliveryHistory({
      events: [acceptedWithoutEvidence],
      onRepairGmail: () => undefined,
    }));

    expect(markup).not.toContain("Find Sent Email &amp; Repair");
  });

  it("offers recovery from the event's own pending state", () => {
    const pendingEvent = {
      ...event,
      status: "pending",
      completedAt: null,
      providerMessageId: null,
    } satisfies InvoiceCommunicationEvent;
    const markup = renderToStaticMarkup(InvoiceDeliveryHistory({
      events: [pendingEvent],
      onRepairGmail: () => undefined,
    }));

    expect(markup).toContain("Find Sent Email &amp; Repair");
  });
});