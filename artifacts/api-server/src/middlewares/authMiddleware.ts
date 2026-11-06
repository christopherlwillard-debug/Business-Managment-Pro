import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  type SessionData,
} from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
      authSessionState?: {
        hasSessionCookie: boolean;
        sessionFound: boolean;
        sessionHadUser: boolean;
        refreshAttempted: boolean;
        refreshSucceeded: boolean;
      };
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

type RefreshResult =
  | { kind: "ok"; session: SessionData }
  | { kind: "invalid" }
  | { kind: "retry" };

const refreshesInFlight = new Map<string, Promise<RefreshResult>>();

function isInvalidRefreshGrant(error: unknown): boolean {
  return error instanceof oidc.ResponseBodyError && error.error === "invalid_grant";
}

async function performRefresh(
  sid: string,
  session: SessionData,
): Promise<RefreshResult> {
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at == null || now <= session.expires_at) {
    return { kind: "ok", session };
  }
  if (!session.refresh_token) return { kind: "invalid" };

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    const refreshed: SessionData = {
      ...session,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? session.refresh_token,
      expires_at: tokens.expiresIn()
        ? now + tokens.expiresIn()!
        : session.expires_at,
    };
    await updateSession(sid, refreshed);
    return { kind: "ok", session: refreshed };
  } catch (error) {
    if (isInvalidRefreshGrant(error)) {
      // Another API process may have completed a rotating refresh-token grant
      // after this request loaded its session. Prefer that newer persisted
      // session rather than invalidating a token that has already been rotated.
      try {
        const latest = await getSession(sid);
        if (
          latest?.user?.id
          && (
            latest.access_token !== session.access_token
            || latest.refresh_token !== session.refresh_token
            || (latest.expires_at != null && latest.expires_at > (session.expires_at ?? 0))
          )
          && latest.expires_at != null
          && Math.floor(Date.now() / 1000) <= latest.expires_at
        ) {
          return { kind: "ok", session: latest };
        }
      } catch {
        // A session-store outage is retryable; it is not proof of revocation.
        return { kind: "retry" };
      }
      return { kind: "invalid" };
    }

    // Discovery, network, provider, and session-store failures are not proof
    // that the user's refresh token has been revoked. Keep the cookie/session
    // so a later request can retry, but do not authenticate this request with
    // an expired access token.
    console.warn(
      "[auth] OIDC refresh temporarily failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return { kind: "retry" };
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<RefreshResult> {
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at == null || now <= session.expires_at) {
    return { kind: "ok", session };
  }

  const existing = refreshesInFlight.get(sid);
  if (existing) return existing;

  const pending = performRefresh(sid, session);
  refreshesInFlight.set(sid, pending);
  try {
    return await pending;
  } finally {
    if (refreshesInFlight.get(sid) === pending) {
      refreshesInFlight.delete(sid);
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  req.authSessionState = {
    hasSessionCookie: Boolean(sid),
    sessionFound: false,
    sessionHadUser: false,
    refreshAttempted: false,
    refreshSucceeded: false,
  };
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  req.authSessionState.sessionFound = Boolean(session);
  req.authSessionState.sessionHadUser = Boolean(session?.user?.id);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  req.authSessionState.refreshAttempted = Boolean(session.expires_at != null && now > session.expires_at);
  const refreshResult = await refreshIfExpired(sid, session);
  req.authSessionState.refreshSucceeded = refreshResult.kind === "ok";
  if (refreshResult.kind === "invalid") {
    await clearSession(res, sid);
    next();
    return;
  }
  if (refreshResult.kind === "retry") {
    // Leave the persisted session and cookie intact for a later refresh attempt.
    next();
    return;
  }

  req.user = refreshResult.session.user;
  next();
}
