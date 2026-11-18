import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { decryptSmtpCredential, isSmtpCredentialEncrypted } from "../lib/smtpCredential.js";

const smtpTestKey = Buffer.alloc(32, 19).toString("base64");

const h = vi.hoisted(() => ({
  settings: undefined as Record<string, any> | undefined,
  writes: [] as Record<string, any>[],
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => {
      const chain: any = {
        from: () => chain,
        limit: () => chain,
        then: (resolve: (rows: any[]) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(h.settings ? [h.settings] : []).then(resolve, reject),
      };
      return chain;
    },
    update: () => ({
      set: (patch: Record<string, any>) => ({
        where: () => ({
          returning: async () => {
            h.writes.push(patch);
            h.settings = { ...h.settings, ...patch };
            return [h.settings];
          },
        }),
        returning: async () => {
          h.writes.push(patch);
          h.settings = { ...h.settings, ...patch };
          return [h.settings];
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, any>) => ({
        returning: async () => {
          h.settings = { id: 1, ...values };
          return [h.settings];
        },
      }),
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  businessesTable: {},
  settingsTable: { id: "settings.id", ownerUserId: "settings.ownerUserId" },
  usersTable: {},
  vehiclesTable: {},
}));

vi.mock("../lib/credentialManager.js", () => ({
  encryptCredential: (value: string) => value,
  decryptCredential: (value: string) => value,
  getCredential: vi.fn(),
}));

vi.mock("../lib/sendEmail", () => ({
  sendEmail: vi.fn(),
  escapeHtml: (value: string) => value,
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {},
}));

const { default: settingsRouter } = await import("./settings");

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: req.header("x-test-user") ?? "owner" };
  next();
});
app.use("/settings", settingsRouter);

function makeSettings(overrides: Record<string, any> = {}) {
  return {
    id: 9,
    ownerUserId: "owner",
    smtpHost: "mail.example.test",
    smtpPort: "587",
    smtpUser: "billing@example.test",
    smtpPass: "smtp-test-sentinel-do-not-return",
    smtpSecure: 0,
    quickLinks: [],
    enabledFeatures: ["invoices"],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function expectNoPasswordInResponse(response: request.Response) {
  expect(response.body).not.toHaveProperty("smtpPass");
  expect(JSON.stringify(response.body)).not.toContain("smtp-test-sentinel-do-not-return");
  expect(JSON.stringify(response.body)).not.toContain("smtp-new-test-sentinel");
  expect(JSON.stringify(response.body)).not.toContain("smtp-nested-test-sentinel");
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SMTP_ENCRYPTION_KEYS_DEVELOPMENT", JSON.stringify({ test_key: smtpTestKey }));
  vi.stubEnv("SMTP_ENCRYPTION_ACTIVE_KEY_ID_DEVELOPMENT", "test_key");
  h.settings = makeSettings();
  h.writes.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("settings SMTP response security", () => {
  it("omits the SMTP password from the owner GET response and keeps safe status", async () => {
    h.settings = makeSettings({
      diagnosticMetadata: { smtpPass: "smtp-nested-test-sentinel" },
    });
    const response = await request(app).get("/settings").set("x-test-user", "owner");

    expect(response.status).toBe(200);
    expectNoPasswordInResponse(response);
    expect(response.body.smtpConfigured).toBe(true);
    expect(response.body.smtpHost).toBe("mail.example.test");
    expect(h.writes).toHaveLength(1);
    expect(isSmtpCredentialEncrypted(h.settings?.smtpPass)).toBe(true);
    expect(decryptSmtpCredential(h.settings?.smtpPass)).toBe("smtp-test-sentinel-do-not-return");
  });

  it("omits the SMTP password from an approved staff GET response", async () => {
    const response = await request(app).get("/settings").set("x-test-user", "staff");

    expect(response.status).toBe(200);
    expectNoPasswordInResponse(response);
    expect(response.body).not.toHaveProperty("smtpHost");
  });

  it("omits the saved password from the owner PUT response and preserves it when blank", async () => {
    const response = await request(app)
      .put("/settings")
      .set("x-test-user", "owner")
      .send({ smtpPass: "" });

    expect(response.status).toBe(200);
    expectNoPasswordInResponse(response);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).not.toHaveProperty("smtpPass");
    expect(h.settings?.smtpPass).toBe("smtp-test-sentinel-do-not-return");
    expect(isSmtpCredentialEncrypted(h.settings?.smtpPass)).toBe(false);
  });

  it("saves a newly supplied password without returning it", async () => {
    const response = await request(app)
      .put("/settings")
      .set("x-test-user", "owner")
      .send({ smtpPass: "smtp-new-test-sentinel" });

    expect(response.status).toBe(200);
    expectNoPasswordInResponse(response);
    expect(isSmtpCredentialEncrypted(h.settings?.smtpPass)).toBe(true);
    expect(h.settings?.smtpPass).not.toContain("smtp-new-test-sentinel");
    expect(decryptSmtpCredential(h.settings?.smtpPass)).toBe("smtp-new-test-sentinel");
    expect(response.body.smtpConfigured).toBe(true);
  });

  it("preserves safe non-secret settings in the response allowlist", async () => {
    h.settings = makeSettings({
      companyName: "BuildPro Test Company",
      defaultPaymentTerms: "Net 15",
      mileageRate: "0.700",
      taxFilingFrequency: "annual",
    });

    const response = await request(app).get("/settings").set("x-test-user", "owner");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      companyName: "BuildPro Test Company",
      defaultPaymentTerms: "Net 15",
      mileageRate: 0.7,
      taxFilingFrequency: "annual",
    });
    expectNoPasswordInResponse(response);
  });
});
