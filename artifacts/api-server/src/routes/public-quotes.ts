import { createHash } from "node:crypto";
import { Router } from "express";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { estimateQuoteEventsTable } from "@workspace/db/schema";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const storage = new ObjectStorageService();
const windowMs = 10 * 60 * 1000;
const maxRequestsPerToken = 40;
const requestCounts = new Map<string, { start: number; count: number }>();

function setPrivateQuoteHeaders(res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function allowRequest(hash: string): boolean {
  const now = Date.now();
  for (const [key, bucket] of requestCounts) {
    if (now - bucket.start >= windowMs) requestCounts.delete(key);
  }
  const bucket = requestCounts.get(hash);
  if (!bucket || now - bucket.start >= windowMs) {
    requestCounts.set(hash, { start: now, count: 1 });
    return true;
  }
  if (bucket.count >= maxRequestsPerToken) return false;
  bucket.count += 1;
  return true;
}

async function activeRevision(token: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const hash = tokenDigest(token);
  if (!allowRequest(hash)) return "rate_limited" as const;
  const [revision] = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.eventType, "revision"),
    eq(estimateQuoteEventsTable.tokenHash, hash),
    isNotNull(estimateQuoteEventsTable.tokenActivatedAt),
    isNull(estimateQuoteEventsTable.tokenRevokedAt),
    gt(estimateQuoteEventsTable.tokenExpiresAt, new Date()),
  )).limit(1);
  return revision ?? null;
}

function unavailable(res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  setPrivateQuoteHeaders(res);
  res.status(404).json({ error: "Quote is unavailable" });
}

router.get("/:token", async (req, res): Promise<void> => {
  setPrivateQuoteHeaders(res);
  const revision = await activeRevision(String(req.params.token ?? ""));
  if (!revision || revision === "rate_limited") {
    if (revision === "rate_limited") res.status(429).json({ error: "Please wait before trying again" });
    else unavailable(res);
    return;
  }
  const snapshot = revision.customerSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    unavailable(res);
    return;
  }
  await db.insert(estimateQuoteEventsTable).values({
    estimateId: revision.estimateId,
    businessId: revision.businessId,
    revisionSnapshotId: revision.id,
    revision: revision.revision,
    eventType: "view",
    status: "viewed",
    requestedAt: new Date(),
    metadata: {},
  });
  const [decision] = await db.select({
    responseType: estimateQuoteEventsTable.responseType,
    responseText: estimateQuoteEventsTable.responseText,
    requestedAt: estimateQuoteEventsTable.requestedAt,
  }).from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.revisionSnapshotId, revision.id),
    eq(estimateQuoteEventsTable.eventType, "response"),
  )).limit(1);
  res.json({
    ...(snapshot as Record<string, unknown>),
    logoUrl: revision.logoObjectPath ? `/api/public/quotes/${req.params.token}/logo` : null,
    response: decision ? {
      type: decision.responseType,
      text: decision.responseText,
      createdAt: decision.requestedAt,
    } : null,
  });
});

async function streamRevisionAsset(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  key: "pdfObjectPath" | "logoObjectPath",
  contentType?: string,
): Promise<void> {
  setPrivateQuoteHeaders(res);
  const revision = await activeRevision(String(req.params.token ?? ""));
  if (!revision || revision === "rate_limited" || !revision[key]) {
    if (revision === "rate_limited") res.status(429).json({ error: "Please wait before trying again" });
    else unavailable(res);
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(revision[key]!);
    res.setHeader("Content-Type", contentType ?? revision.logoContentType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", key === "pdfObjectPath" ? "inline; filename=\"quote.pdf\"" : "inline");
    const stream = file.createReadStream();
    stream.on("error", () => {
      if (!res.headersSent) unavailable(res);
      else res.destroy();
    });
    stream.pipe(res);
  } catch {
    unavailable(res);
  }
}

router.get("/:token/pdf", async (req, res): Promise<void> => {
  await streamRevisionAsset(req, res, "pdfObjectPath", "application/pdf");
});

router.get("/:token/logo", async (req, res): Promise<void> => {
  await streamRevisionAsset(req, res, "logoObjectPath");
});

router.post("/:token/responses", async (req, res): Promise<void> => {
  setPrivateQuoteHeaders(res);
  const revision = await activeRevision(String(req.params.token ?? ""));
  if (!revision || revision === "rate_limited") {
    if (revision === "rate_limited") res.status(429).json({ error: "Please wait before trying again" });
    else unavailable(res);
    return;
  }
  const type = req.body?.type;
  const text = req.body?.text == null ? null : String(req.body.text).trim();
  if (!["approved", "declined", "changes_requested"].includes(type)
    || (text != null && text.length > 4000)) {
    res.status(400).json({ error: "Invalid quote response" });
    return;
  }
  const [existing] = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.revisionSnapshotId, revision.id),
    eq(estimateQuoteEventsTable.eventType, "response"),
  )).limit(1);
  if (existing) {
    if (existing.responseType === type && (existing.responseText ?? null) === text) {
      res.status(200).json({ success: true, response: type });
      return;
    }
    res.status(409).json({ error: "A different response has already been recorded" });
    return;
  }
  const [created] = await db.insert(estimateQuoteEventsTable).values({
    estimateId: revision.estimateId,
    businessId: revision.businessId,
    revisionSnapshotId: revision.id,
    revision: revision.revision,
    eventType: "response",
    status: "recorded",
    responseType: type,
    responseText: text,
    requestedAt: new Date(),
    completedAt: new Date(),
    metadata: {},
  }).onConflictDoNothing().returning({ id: estimateQuoteEventsTable.id });
  if (!created) {
    const [raced] = await db.select({
      responseType: estimateQuoteEventsTable.responseType,
      responseText: estimateQuoteEventsTable.responseText,
    }).from(estimateQuoteEventsTable).where(and(
      eq(estimateQuoteEventsTable.revisionSnapshotId, revision.id),
      eq(estimateQuoteEventsTable.eventType, "response"),
    )).limit(1);
    if (raced?.responseType === type && (raced.responseText ?? null) === text) {
      res.status(200).json({ success: true, response: type });
      return;
    }
    res.status(409).json({ error: "A different response has already been recorded" });
    return;
  }
  res.status(201).json({ success: true, response: type });
});

export default router;
