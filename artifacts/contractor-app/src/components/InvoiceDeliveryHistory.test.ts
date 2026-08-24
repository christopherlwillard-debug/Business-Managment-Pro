import { describe, expect, it, vi } from "vitest";
import { Children, createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceDeliveryHistory } from "./InvoiceDeliveryHistory";

const timestamps = ["2026-08-24T10:30:00.000Z", "2026-08-25T11:45:00.000Z"];

function getButton(element: ReactElement) {
  const button = Children.toArray(element.props.children)[0];
  if (!isValidElement(button)) throw new Error("Expected reminder button");
  return button;
}

function indicator(props: {
  invoiceNumber?: string;
  remindersSentAt: string[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return createElement(InvoiceDeliveryHistory, props);
}

describe("InvoiceDeliveryHistory", () => {
  it("renders the reminder count and timestamps without rendering anything for empty history", () => {
    const openMarkup = renderToStaticMarkup(InvoiceDeliveryHistory({
      invoiceNumber: "INV-100",
      remindersSentAt: timestamps,
      isOpen: true,
      onToggle: () => {},
    })!);
    const compactMarkup = renderToStaticMarkup(InvoiceDeliveryHistory({
      invoiceNumber: "INV-101",
      remindersSentAt: [],
      isOpen: false,
      onToggle: () => {},
    })!);

    expect(openMarkup).toContain('aria-label="2 reminders sent"');
    expect(openMarkup).toContain("Reminder history");
    expect(openMarkup).toContain("INV-100");
    expect(compactMarkup).toBe("");
  });

  it("stops row navigation and toggles history when the bell is clicked", () => {
    const onToggle = vi.fn();
    const element = InvoiceDeliveryHistory({
      invoiceNumber: "INV-100",
      remindersSentAt: timestamps,
      isOpen: false,
      onToggle,
    })!;
    const button = getButton(element);
    const stopPropagation = vi.fn();

    button.props.onClick({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledOnce();
  });
});