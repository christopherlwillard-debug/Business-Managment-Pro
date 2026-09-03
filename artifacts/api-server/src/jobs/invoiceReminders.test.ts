import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const updates: unknown[] = [];

  const takeSelect = () => {
    if (selectQueue.length === 0) {
      throw new Error("Unexpected database select: strict queue exhausted");
    }
    return selectQueue.shift()!;
  };

  const selectChain = () => {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve().then(takeSelect).then(resolve, reject),
    };
    return chain;
  };

  const updateChain = () => {
    const chain: any = {
      set: (values: unknown) => {
        updates.push(values);
        return chain;
      },
      where: () => Promise.resolve(),
    };
    return chain;
  };

  return {
    selectQueue,
    updates,
    db: {
      select: vi.fn(selectChain),
      update: vi.fn(updateChain),
    },
    sendInvoiceEmail: vi.fn(),
    sendAndRecord: vi.fn(),
    confirmedGmailInvoiceIds: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({ db: h.db }));
vi.mock("../lib/invoiceEmail", () => ({ sendInvoiceEmail: h.sendInvoiceEmail }));
vi.mock("../lib/invoiceCommunication", async importOriginal => {
  const actual = await importOriginal<typeof import("../lib/invoiceCommunication.js")>();
  h.confirmedGmailInvoiceIds.mockImplementation(actual.confirmedGmailInvoiceIds);
  return {
    ...actual,
    confirmedGmailInvoiceIds: h.confirmedGmailInvoiceIds,
    sendAndRecordInvoiceCommunication: h.sendAndRecord,
  };
});
vi.mock("../lib/invoiceBranding.js", () => ({
  findInvoiceBusiness: vi.fn(() => ({ id: 1, name: "BuildPro" })),
  loadInvoiceBrand: vi.fn(async () => ({
    displayName: "BuildPro",
    phone: null,
    email: null,
  })),
  invoiceEmailSettingsFromBrand: vi.fn((settings: unknown) => settings),
}));

import { processInvoiceReminders } from "./invoiceReminders.js";

const settings = {
  invoiceReminderEnabled: true,
  invoiceReminderDay1: 7,
  invoiceReminderDay2: 14,
};

function eligibleInvoice(id = 42) {
  return {
    id,
    status: "sent",
    invoiceNumber: `INV-${id}`,
    issueDate: "2026-07-01",
    dueDate: "2026-07-15",
    clientId: 7,
    clientName: "Test Client",
    clientEmail: "client@example.com",
    reminderOptOut: false,
    businessLine: "general",
    businessId: 1,
    squarePaymentLinkUrl: null,
    stripePaymentLinkUrl: null,
    total: "125.00",
    subtotal: "125.00",
    taxRate: "0",
    taxAmount: "0",
    terms: null,
    notes: null,
    lineItems: [],
    remindersSentAt: [],
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
  };
}

type CommunicationHistory = {
  invoiceId: number;
  eventType: string;
  status: string;
  provider: string;
  providerMessageId: string | null;
};

function queueWorker(history: CommunicationHistory[], invoice = eligibleInvoice()) {
  h.selectQueue.push([settings], [{ id: 1, name: "BuildPro" }], [invoice], history);
}

function expectStrictQueueConsumed() {
  expect(h.selectQueue, "every queued database result must be consumed").toHaveLength(0);
}

describe("scheduled invoice reminder worker Gmail boundary", () => {
  beforeEach(() => {
    h.selectQueue.length = 0;
    h.updates.length = 0;
    vi.clearAllMocks();
    h.sendInvoiceEmail.mockResolvedValue({
      provider: "gmail",
      messageId: "reminder-message-1",
    });
    h.sendAndRecord.mockImplementation(async (_context: unknown, send: () => Promise<unknown>) => {
      await send();
      return {
        finalized: true,
        event: { completedAt: new Date("2026-09-02T14:00:00.000Z") },
      };
    });
  });

  it.each([
    ["manual SENT status", {
      invoiceId: 42,
      eventType: "manual_reminder",
      status: "accepted",
      provider: "manual",
      providerMessageId: null,
    }],
    ["failed Gmail history", {
      invoiceId: 42,
      eventType: "initial_invoice",
      status: "failed",
      provider: "gmail",
      providerMessageId: "failed-message",
    }],
    ["canceled Gmail history", {
      invoiceId: 42,
      eventType: "initial_invoice",
      status: "unknown",
      provider: "gmail",
      providerMessageId: "canceled-message",
    }],
    ["missing message-ID history", {
      invoiceId: 42,
      eventType: "initial_invoice",
      status: "accepted",
      provider: "gmail",
      providerMessageId: null,
    }],
  ] satisfies Array<[string, CommunicationHistory]>)("sends nothing for %s", async (_scenario, history) => {
    queueWorker([history]);

    await processInvoiceReminders();

    expect(h.confirmedGmailInvoiceIds).toHaveBeenCalledWith([42]);
    expect(h.sendInvoiceEmail).not.toHaveBeenCalled();
    expect(h.sendAndRecord).not.toHaveBeenCalled();
    expect(h.updates).toHaveLength(0);
    expectStrictQueueConsumed();
  });

  it("sends after an accepted Gmail invoice event with confirmed provider evidence", async () => {
    queueWorker([{
      invoiceId: 42,
      eventType: "initial_invoice",
      status: "accepted",
      provider: "gmail",
      providerMessageId: "invoice-message-1",
    }]);

    await processInvoiceReminders();

    expect(h.confirmedGmailInvoiceIds).toHaveBeenCalledWith([42]);
    expect(h.sendInvoiceEmail).toHaveBeenCalledOnce();
    expect(h.sendAndRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 42,
        eventType: "automatic_reminder",
        source: "automatic",
      }),
      expect.any(Function),
    );
    expect(h.updates).toContainEqual({
      remindersSentAt: ["2026-09-02T14:00:00.000Z"],
    });
    expectStrictQueueConsumed();
  });

  it("does not write remindersSentAt when the provider rejects the reminder", async () => {
    queueWorker([{
      invoiceId: 42,
      eventType: "resend_invoice",
      status: "accepted",
      provider: "gmail",
      providerMessageId: "invoice-message-2",
    }]);
    h.sendInvoiceEmail.mockRejectedValue(new Error("Gmail rejected reminder"));

    await processInvoiceReminders();

    expect(h.sendInvoiceEmail).toHaveBeenCalledOnce();
    expect(h.updates).toHaveLength(0);
    expectStrictQueueConsumed();
  });

  it("does not write remindersSentAt when provider acceptance cannot be finalized", async () => {
    queueWorker([{
      invoiceId: 42,
      eventType: "initial_invoice",
      status: "accepted",
      provider: "gmail",
      providerMessageId: "invoice-message-3",
    }]);
    h.sendAndRecord.mockImplementation(async (_context: unknown, send: () => Promise<unknown>) => {
      await send();
      return {
        finalized: false,
        finalizationError: "communication event update failed",
        event: { completedAt: null },
      };
    });

    await processInvoiceReminders();

    expect(h.sendInvoiceEmail).toHaveBeenCalledOnce();
    expect(h.updates).toHaveLength(0);
    expectStrictQueueConsumed();
  });
});