import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  userId: "owner",
  ownerId: "owner",
  getObjectEntityUploadURL: vi.fn(),
  normalizeObjectEntityPath: vi.fn(),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityUploadURL(...args: any[]) {
      return h.getObjectEntityUploadURL(...args);
    }
    normalizeObjectEntityPath(...args: any[]) {
      return h.normalizeObjectEntityPath(...args);
    }
  },
  ObjectNotFoundError: class extends Error {},
}));

vi.mock("./guards", () => ({
  getOwnerId: () => Promise.resolve(h.ownerId),
  getRequestUserId: () => h.userId,
}));

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn() },
  accessRequestsTable: { userId: {}, status: {}, permissions: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

const { default: storageRouter } = await import("./storage");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(storageRouter);
  return app;
}

beforeEach(() => {
  h.userId = "owner";
  h.ownerId = "owner";
  h.getObjectEntityUploadURL.mockReset();
  h.normalizeObjectEntityPath.mockReset();
  h.getObjectEntityUploadURL.mockResolvedValue("https://storage.googleapis.com/signed-upload");
  h.normalizeObjectEntityPath.mockReturnValue("/objects/uploads/unique-id");
});

describe("generic presigned upload authorization", () => {
  it("rejects an approved non-owner before creating an upload URL", async () => {
    h.userId = "approved-admin";

    const response = await request(createApp())
      .post("/storage/uploads/request-url")
      .send({ name: "document.pdf", size: 1024, contentType: "application/pdf" });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/owner access required/i);
    expect(h.getObjectEntityUploadURL).not.toHaveBeenCalled();
  });

  it("allows the owner to request a presigned upload URL", async () => {
    const response = await request(createApp())
      .post("/storage/uploads/request-url")
      .send({ name: "document.pdf", size: 1024, contentType: "application/pdf" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      uploadURL: "https://storage.googleapis.com/signed-upload",
      objectPath: "/objects/uploads/unique-id",
      metadata: { name: "document.pdf", size: 1024, contentType: "application/pdf" },
    });
    expect(h.getObjectEntityUploadURL).toHaveBeenCalledTimes(1);
  });
});
