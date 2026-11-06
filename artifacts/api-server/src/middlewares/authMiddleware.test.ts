import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  session: null as any,
  getSession: vi.fn(),
  clearSession: vi.fn(),
  getOidcConfig: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("openid-client", () => ({
  refreshTokenGrant: vi.fn(),
  ResponseBodyError: class ResponseBodyError extends Error {
    error: string;
    constructor(error: string) {
      super(error);
      this.error = error;
    }
  },
}));

vi.mock("../lib/auth", () => ({
  clearSession: (...args: any[]) => h.clearSession(...args),
  getOidcConfig: (...args: any[]) => h.getOidcConfig(...args),
  getSessionId: () => "test-session",
  getSession: (...args: any[]) => h.getSession(...args),
  updateSession: (...args: any[]) => h.updateSession(...args),
}));

const oidc = await import("openid-client");
const { authMiddleware } = await import("./authMiddleware");

function createApp() {
  const app = express();
  app.use(authMiddleware);
  app.get("/", (req, res) => {
    res.json({
      authenticated: req.isAuthenticated(),
      userId: req.user?.id ?? null,
    });
  });
  return app;
}

function expiredSession() {
  return {
    user: { id: "user-1", email: "owner@example.test" },
    access_token: "expired-access-token",
    refresh_token: "old-refresh-token",
    expires_at: 1,
  };
}

function oauthResponseError(code: string): Error & { error: string } {
  return Object.assign(
    Object.create(oidc.ResponseBodyError.prototype),
    { name: "ResponseBodyError", message: code, error: code },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.session = expiredSession();
  h.getSession.mockImplementation(async () => h.session);
  h.clearSession.mockResolvedValue(undefined);
  h.getOidcConfig.mockResolvedValue({});
  h.updateSession.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OIDC session refresh reliability", () => {
  it("preserves the session after a transient network failure without authenticating with an expired token", async () => {
    vi.mocked(oidc.refreshTokenGrant).mockRejectedValueOnce(new TypeError("network unavailable"));

    const response = await request(createApp()).get("/");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false, userId: null });
    expect(h.clearSession).not.toHaveBeenCalled();
    expect(h.updateSession).not.toHaveBeenCalled();
  });

  it("preserves the session after a temporary OAuth provider error", async () => {
    vi.mocked(oidc.refreshTokenGrant).mockRejectedValueOnce(oauthResponseError("server_error"));

    const response = await request(createApp()).get("/");

    expect(response.body.authenticated).toBe(false);
    expect(h.clearSession).not.toHaveBeenCalled();
  });

  it("deletes the session when the provider definitively rejects the refresh grant", async () => {
    vi.mocked(oidc.refreshTokenGrant).mockRejectedValueOnce(oauthResponseError("invalid_grant"));

    const response = await request(createApp()).get("/");

    expect(response.body.authenticated).toBe(false);
    expect(h.clearSession).toHaveBeenCalledTimes(1);
    expect(h.clearSession).toHaveBeenCalledWith(expect.anything(), "test-session");
  });

  it("uses a newer session when another process has already rotated the refresh token", async () => {
    const latestSession = {
      ...expiredSession(),
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    h.getSession
      .mockResolvedValueOnce(expiredSession())
      .mockResolvedValueOnce(latestSession);
    vi.mocked(oidc.refreshTokenGrant).mockRejectedValueOnce(oauthResponseError("invalid_grant"));

    const response = await request(createApp()).get("/");

    expect(response.body).toEqual({ authenticated: true, userId: "user-1" });
    expect(h.clearSession).not.toHaveBeenCalled();
  });

  it("stores newly rotated tokens after a successful refresh", async () => {
    vi.mocked(oidc.refreshTokenGrant).mockResolvedValueOnce({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expiresIn: () => 3600,
    } as any);

    const response = await request(createApp()).get("/");

    expect(response.body).toEqual({ authenticated: true, userId: "user-1" });
    expect(h.updateSession).toHaveBeenCalledWith("test-session", expect.objectContaining({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
    }));
    expect(h.clearSession).not.toHaveBeenCalled();
  });

  it("shares one refresh operation across concurrent requests for the same session", async () => {
    let releaseRefresh!: (value: any) => void;
    const pendingRefresh = new Promise(resolve => {
      releaseRefresh = resolve;
    });
    vi.mocked(oidc.refreshTokenGrant).mockReturnValueOnce(pendingRefresh as any);

    const app = createApp();
    const first = request(app).get("/");
    const second = request(app).get("/");
    const responses = Promise.all([first, second]);

    await vi.waitFor(() => {
      expect(oidc.refreshTokenGrant).toHaveBeenCalledTimes(1);
    });
    releaseRefresh({
      access_token: "shared-new-access-token",
      refresh_token: "shared-new-refresh-token",
      expiresIn: () => 3600,
    });

    const [firstResponse, secondResponse] = await responses;
    expect(firstResponse.body.authenticated).toBe(true);
    expect(secondResponse.body.authenticated).toBe(true);
    expect(oidc.refreshTokenGrant).toHaveBeenCalledTimes(1);
    expect(h.updateSession).toHaveBeenCalledTimes(1);
  });
});
