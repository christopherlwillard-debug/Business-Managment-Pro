import { createHash, createHmac } from "node:crypto";

export function getEstimateQuoteToken(estimateId: number, revision: number, contentHash: string): string {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error("Quote delivery token key is not configured");
  return createHmac("sha256", key)
    .update(`estimate-quote:${estimateId}:${revision}:${contentHash}`)
    .digest("base64url");
}

export function hashEstimateQuoteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getTrustedQuoteOrigin(requestHost: string, requestProtocol: string): string {
  const host = requestHost.trim().toLowerCase();
  const configuredHosts = [
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
    process.env.REPLIT_DEV_DOMAIN ?? "",
  ].map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!host || !configuredHosts.includes(host)) {
    throw new Error("The quote link host is not an approved application domain");
  }
  const protocol = requestProtocol === "https" ? "https" : "http";
  return `${protocol}://${host}`;
}
