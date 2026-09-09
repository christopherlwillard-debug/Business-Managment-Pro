import { describe, expect, it } from "vitest";
import {
  clientProfileRouteStopColumns,
  clientProfileSquarePaymentColumns,
} from "./client-profile-projections.js";

describe("client profile legacy-safe projections", () => {
  it("does not select the model-only Square business ownership column", () => {
    expect(Object.keys(clientProfileSquarePaymentColumns)).toEqual([
      "id",
      "squarePaymentId",
      "amountCents",
      "description",
      "invoiceId",
      "invoiceNumber",
      "clientName",
      "clientId",
      "paidAt",
      "createdAt",
    ]);
    expect(clientProfileSquarePaymentColumns).not.toHaveProperty("businessId");
  });

  it("keeps route stops constrained through the authorized client relationship", () => {
    expect(Object.keys(clientProfileRouteStopColumns)).toContain("clientId");
    expect(clientProfileRouteStopColumns).not.toHaveProperty("businessId");
    expect(clientProfileRouteStopColumns).not.toHaveProperty("businessLine");
  });
});