import { describe, expect, it } from "vitest";
import { reminderEligibilityError, reminderMessage } from "./invoiceReminderPolicy";

const eligible = {
  status: "sent",
  invoiceNumber: "INV-100",
  clientEmail: "client@example.com",
  reminderOptOut: false,
  hasConfirmedSend: true,
};

describe("invoice reminder policy", () => {
  it.each([
    ["paid", { status: "paid" }, "Invoice is already paid."],
    ["voided", { status: "cancelled" }, "A voided invoice cannot receive reminders."],
    ["draft", { status: "draft" }, "Draft invoices must be accepted before sending reminders."],
    ["unconfirmed send", { hasConfirmedSend: false }, "Invoice has not been successfully sent through Gmail."],
    ["opted out", { reminderOptOut: true }, "This client has opted out of invoice reminders."],
    ["unnumbered", { invoiceNumber: null }, "Invoice must have an invoice number before sending reminders."],
    ["missing email", { clientEmail: null }, "Client has no email address on file."],
  ] as const)("rejects %s consistently", (_name, overrides, expected) => {
    expect(reminderEligibilityError({ ...eligible, ...overrides })).toBe(expected);
  });

  it("builds a plain contact reminder when there is no payment link", () => {
    const message = reminderMessage(
      { ...eligible, clientName: "Taylor", issueDate: "2026-08-01", total: "1250" },
      "BuildPro",
      "555-0100",
      "billing@buildpro.example",
      false,
    );

    expect(message).toContain("Please contact us to arrange payment.");
    expect(message).toContain("Phone: 555-0100");
    expect(message).not.toContain("pay securely online");
  });

  it("uses the payment-link wording when a link exists", () => {
    const message = reminderMessage(
      { ...eligible, clientName: "Taylor", total: 1250 },
      "BuildPro",
      null,
      null,
      true,
    );

    expect(message).toContain("pay securely online");
  });
});