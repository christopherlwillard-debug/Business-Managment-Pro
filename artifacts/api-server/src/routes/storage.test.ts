import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  userId: "owner",
  ownerId: "owner",
  getObjectEntityUploadURL: vi.fn(),
  normalizeObjectEntityPath: vi.fn(),
  selectRows: [] as any[],
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
  db: {
    select: () => {
      const chain: any = {
        from: () => chain, innerJoin: () => chain, where: () => chain, limit: () => chain,
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(h.selectRows.shift() ?? []).then(resolve);
        },
      };
      return chain;
    },
  },
  accessRequestsTable: { userId: {}, status: {}, permissions: {} },
  jobsTable: { id: {}, businessId: {}, businessLine: {} },
  jobChecklistsTable: { jobId: {}, id: {} },
  jobChecklistItemsTable: { id: {}, jobChecklistId: {} },
  jobChecklistItemPhotosTable: { objectPath: {}, jobChecklistItemId: {}, mediaType: {} },
  jobStartPhotosTable: { objectPath: {}, jobChecklistId: {} },
  jobFinishedPhotosTable: { objectPath: {}, jobChecklistId: {} },
}));

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async (req: any) => ({ id: Number(req.query.businessId), slug: "general_contracting" }),
  belongsToBusiness: (job: any, scope: any) => job.businessId === scope.id,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
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
  h.selectRows.length = 0;
});

describe("generic presigned upload authorization", () => {
  it.each([
    "uploads/checklist-photos/photo.jpg",
    "uploads/start-photos/photo.jpg",
    "uploads/finished-photos/photo.jpg",
  ])("denies checklist media %s from a different business even to the owner", async (path) => {
    h.selectRows.push([{ job: { id: 22, businessId: 2 } }]);
    const response = await request(createApp())
      .get(`/storage/objects/${path}?businessId=1`);
    expect(response.status).toBe(403);
    expect(h.selectRows).toHaveLength(0);
  });

  it("rejects an approved non-owner before creating an upload URL", async () => {
    h.userId = "approved-admin";

    const response = await request(createApp())
      .post("/storage/uploads/request-url")
      .send({ name: "document.pdf", size: 1024, contentType: "application/pdf" });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/owner access required/i);
    expect(h.getObjectEntityUploadURL).not.toHaveBeenCalled();
  });

  it("rejects generic uploads with an unsupported content type", async () => {
    const response = await request(createApp())
      .post("/storage/uploads/request-url")
      .send({ name: "payload.exe", size: 1024, contentType: "application/x-msdownload" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/file type is not supported/i);
    expect(h.getObjectEntityUploadURL).not.toHaveBeenCalled();
  });

  it("rejects empty, oversized, and malformed upload metadata", async () => {
    const invalidPayloads = [
      { name: "empty.pdf", size: 0, contentType: "application/pdf" },
      { name: "large.pdf", size: 25 * 1024 * 1024 + 1, contentType: "application/pdf" },
      { name: "bad.pdf", size: 1024.5, contentType: "application/pdf" },
      { name: "x".repeat(256), size: 1024, contentType: "application/pdf" },
      { name: "missing-type.pdf", size: 1024 },
    ];

    for (const payload of invalidPayloads) {
      const response = await request(createApp()).post("/storage/uploads/request-url").send(payload);
      expect(response.status).toBe(400);
    }
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
