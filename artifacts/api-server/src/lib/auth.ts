import * as client from "openid-client";
import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const TEST_LOGIN_PROOF_TTL = 60_000;

export interface SessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

let oidcConfig: client.Configuration | null = null;

export function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
  ) {
    return "/";
  }

  try {
    const parsed = new URL(value, "http://buildpro.test");
    if (parsed.origin !== "http://buildpro.test") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function getTestLoginSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for development test login");
  return secret;
}

function signTestLoginProof(timestamp: string, nonce: string, returnTo: string): string {
  return crypto
    .createHmac("sha256", getTestLoginSecret())
    .update(`${timestamp}.${nonce}.${returnTo}`)
    .digest("hex");
}

export function createTestLoginProof(returnTo: string): {
  timestamp: string;
  nonce: string;
  signature: string;
} {
  const safeReturnTo = getSafeReturnTo(returnTo);
  if (safeReturnTo !== returnTo) throw new Error("Unsafe development test return path");
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString("hex");
  return {
    timestamp,
    nonce,
    signature: signTestLoginProof(timestamp, nonce, safeReturnTo),
  };
}

export function verifyTestLoginProof(input: {
  timestamp: unknown;
  nonce: unknown;
  signature: unknown;
  returnTo: string;
}): boolean {
  if (
    typeof input.timestamp !== "string"
    || typeof input.nonce !== "string"
    || typeof input.signature !== "string"
    || !/^\d+$/.test(input.timestamp)
    || !/^[a-f0-9]{32}$/.test(input.nonce)
    || !/^[a-f0-9]{64}$/.test(input.signature)
  ) {
    return false;
  }

  const issuedAt = Number(input.timestamp);
  if (!Number.isSafeInteger(issuedAt) || Math.abs(Date.now() - issuedAt) > TEST_LOGIN_PROOF_TTL) {
    return false;
  }

  const expected = Buffer.from(
    signTestLoginProof(input.timestamp, input.nonce, input.returnTo),
    "hex",
  );
  const actual = Buffer.from(input.signature, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function getOidcConfig(): Promise<client.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await client.discovery(
      new URL(ISSUER_URL),
      process.env.REPL_ID!,
    );
  }
  return oidcConfig;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(
  res: Response,
  sid?: string,
): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}
