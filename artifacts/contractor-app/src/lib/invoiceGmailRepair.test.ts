import { describe, expect, it, vi } from "vitest";
import { reconnectAndRepairInvoiceGmail } from "./invoiceGmailRepair";

describe("reconnectAndRepairInvoiceGmail", () => {
  it("hands the newly returned token directly to the selected event repair", async () => {
    const reconnect = vi.fn().mockResolvedValue("fresh-gmail-token");
    const repair = vi.fn().mockResolvedValue(undefined);

    await reconnectAndRepairInvoiceGmail(reconnect, repair, 77);

    expect(reconnect).toHaveBeenCalledOnce();
    expect(repair).toHaveBeenCalledOnce();
    expect(repair).toHaveBeenCalledWith(77, "fresh-gmail-token");
  });
});