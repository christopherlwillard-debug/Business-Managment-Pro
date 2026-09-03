import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  generateCapabilityStatementPdfBuffer: vi.fn(),
  getCapabilityStatementOptions: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const select = vi.fn(() => {
    const chain: any = {
      from: () => chain,
      limit: () => {
        if (h.selectQueue.length === 0) {
          throw new Error("Unexpected database select: strict queue exhausted");
        }
        return Promise.resolve(h.selectQueue.shift());
      },
    };
    return chain;
  });
  return {
    db: { select },
    accessRequestsTable: {},
    settingsTable: {
      ownerUserId: "owner_user_id",
    },
  };
});

vi.mock("../lib/generateCapabilityStatementPdf.js", () => ({
  generateCapabilityStatementPdfBuffer: h.generateCapabilityStatementPdfBuffer,
  getCapabilityStatementOptions: h.getCapabilityStatementOptions,
}));

import pdfRouter from "./pdf.js";
import { ownerGuard } from "./guards.js";
import { invalidateOwnerCache } from "./owner-cache.js";

function capabilityStatementApp(userId: string) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      id: userId,
      email: `${userId}@example.com`,
      firstName: "Approved",
      lastName: "User",
      profileImageUrl: null,
    };
    next();
  });
  app.use("/pdf/capability-statement", ownerGuard());
  app.use("/pdf", pdfRouter);
  return app;
}

describe("Capability Statement owner access", () => {
  beforeEach(() => {
    invalidateOwnerCache();
    h.selectQueue.length = 0;
    vi.clearAllMocks();
  });

  it.each([
    "/pdf/capability-statement?businessId=7",
    "/pdf/capability-statement/options?businessId=7",
  ])("rejects an approved non-owner before accessing %s", async path => {
    h.selectQueue.push([{ ownerUserId: "owner-user" }]);

    const response = await request(capabilityStatementApp("approved-non-owner")).get(path);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden" });
    expect(h.generateCapabilityStatementPdfBuffer).not.toHaveBeenCalled();
    expect(h.getCapabilityStatementOptions).not.toHaveBeenCalled();
    expect(h.selectQueue, "every queued database result must be consumed").toHaveLength(0);
  });
});