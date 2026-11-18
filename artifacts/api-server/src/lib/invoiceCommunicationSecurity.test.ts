import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  event: undefined as any,
  update: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@workspace/db", () => ({
  db: {
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          h.event = { id: 17, ...value };
          return [h.event];
        },
      }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        h.update = value;
        return {
          where: () => ({
            returning: async () => [{ ...h.event, ...value }],
          }),
        };
      },
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  invoiceCommunicationEventsTable: { id: "id", invoiceId: "invoiceId", status: "status" },
  invoicesTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
}));

const { sendAndRecordInvoiceCommunication } = await import("./invoiceCommunication.js");

describe("invoice communication SMTP error storage", () => {
  afterEach(() => {
    h.event = undefined;
    h.update = undefined;
  });

  it("stores only a safe error category and reference when delivery fails", async () => {
    const rawError = Object.assign(
      new Error("535 password=synthetic-password recipient=private@example.test"),
      { code: "EAUTH", response: "AUTH synthetic-token" },
    );
    await expect(sendAndRecordInvoiceCommunication({
      invoiceId: 41,
      eventType: "initial_invoice",
      channel: "email",
      provider: "smtp",
      recipient: "private@example.test",
    }, async () => {
      throw rawError;
    })).rejects.toMatchObject({ errorCode: "email_authentication" });

    expect(h.update).toMatchObject({ status: "failed", errorCode: "email_authentication" });
    expect(h.update?.errorMessage).toContain("Reference:");
    expect(JSON.stringify(h.update)).not.toContain("synthetic-password");
    expect(JSON.stringify(h.update)).not.toContain("synthetic-token");
    expect(JSON.stringify(h.update)).not.toContain("private@example.test");
  });
});
