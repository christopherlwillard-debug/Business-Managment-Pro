import crypto from "node:crypto";

export type SafeEmailErrorCode = "email_authentication" | "email_connection" | "email_rejected" | "email_unknown";

export class SafeEmailDeliveryError extends Error {
  readonly errorCode: SafeEmailErrorCode;
  readonly referenceId: string;

  constructor(errorCode: SafeEmailErrorCode, referenceId = crypto.randomUUID()) {
    super(`Email delivery failed (${errorCode}). Reference: ${referenceId}`);
    this.name = "SafeEmailDeliveryError";
    this.errorCode = errorCode;
    this.referenceId = referenceId;
  }
}

const AUTH_CODES = new Set(["EAUTH", "ESOCKET"]);
const CONNECTION_CODES = new Set(["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "EDNS", "ECONNRESET"]);

export function sanitizeEmailDeliveryError(error: unknown): SafeEmailDeliveryError {
  if (error instanceof SafeEmailDeliveryError) return error;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "").toUpperCase()
    : "";
  const statusCode = typeof error === "object" && error !== null && "responseCode" in error
    ? Number((error as { responseCode?: unknown }).responseCode)
    : NaN;
  const category: SafeEmailErrorCode = AUTH_CODES.has(code)
    ? "email_authentication"
    : CONNECTION_CODES.has(code)
      ? "email_connection"
      : Number.isFinite(statusCode) && statusCode >= 400
        ? "email_rejected"
        : "email_unknown";
  return new SafeEmailDeliveryError(category);
}
