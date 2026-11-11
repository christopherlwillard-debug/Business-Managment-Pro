import { createHash } from "node:crypto";
import { Router } from "express";
import { and, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  clientsTable,
  estimateQuoteEventsTable,
  estimatesTable,
  settingsTable,
} from "@workspace/db/schema";
import {
  belongsToBusinessReadScope,
  requestedBusinessReadScope,
  invalidBusinessScope,
  hasRequestedBusiness,
} from "../lib/business-scope.js";
import { getOwnerId, getRequestUser, getRequestUserId } from "./guards.js";
import { buildEstimateQuoteSnapshot } from "../lib/estimateQuoteSnapshot.js";
import { stageEstimateQuoteArchive, removeStagedEstimateQuoteArchive } from "../lib/estimateQuoteArchive.js";
import { getEstimateQuoteToken, getTrustedQuoteOrigin, hashEstimateQuoteToken } from "../lib/estimateQuoteDelivery.js";
import { generateEstimateQuotePdf } from "../lib/generateEstimateQuotePdf.js";
import { EmailProviderRejectedError, escapeHtml, sendEmail } from "../lib/sendEmail.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const storage = new ObjectStorageService();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeEvent(event: typeof estimateQuoteEventsTable.$inferSelect) {
  return {
    id: event.id,
    estimateId: event.estimateId,
    revision: event.revision,
    eventType: event.eventType,
    status: event.status,
    recipient: event.recipient,
    actorName: event.actorName,
    requestedAt: event.requestedAt,
    completedAt: event.completedAt,
    providerMessageId: event.providerMessageId,
    responseType: event.responseType,
    responseText: event.responseText,
    responseAt: event.eventType === "response" ? event.requestedAt : null,
    errorMessage: event.errorMessage,
  };
}

router.get("/:id/quote-events", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  if (!Number.isSafeInteger(id) || id <= 0 || !scope) {
    res.status(400).json({ error: "A valid estimate and business are required" });
    return;
  }
  const [estimate] = await db.select({
    businessId: estimatesTable.businessId,
    businessLine: estimatesTable.businessLine,
  }).from(estimatesTable).where(eq(estimatesTable.id, id));
  if (!estimate || !belongsToBusinessReadScope(estimate, scope)) {
    res.status(404).json({ error: "Estimate not found" });
    return;
  }
  const events = await db.select().from(estimateQuoteEventsTable)
    .where(eq(estimateQuoteEventsTable.estimateId, id))
    .orderBy(desc(estimateQuoteEventsTable.requestedAt));
  res.json(events.map(safeEvent));
});

router.get("/:id/quote-events/:eventId/pdf", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(eventId) || !scope) {
    res.status(400).json({ error: "A valid estimate and business are required" });
    return;
  }
  const [revision] = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.id, eventId),
    eq(estimateQuoteEventsTable.estimateId, id),
    eq(estimateQuoteEventsTable.eventType, "revision"),
  )).limit(1);
  if (!revision || !belongsToBusinessReadScope({ businessId: revision.businessId }, scope) || !revision.pdfObjectPath) {
    res.status(404).json({ error: "Quote revision not found" });
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(revision.pdfObjectPath);
    const [buffer] = await file.download();
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="quote-revision-${revision.revision}.pdf"`);
    res.send(buffer);
  } catch {
    res.status(404).json({ error: "Quote revision file not found" });
  }
});

router.post("/:id/send", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const recipient = typeof req.body?.recipient === "string" ? req.body.recipient.trim() : "";
  const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
  let publicOrigin: string;
  try {
    publicOrigin = getTrustedQuoteOrigin(req.get("host") ?? "", req.protocol);
  } catch {
    res.status(400).json({ error: "Quote delivery is not available on this host" });
    return;
  }
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  if (!Number.isSafeInteger(id) || id <= 0 || !scope || recipient.length > 254 || !emailPattern.test(recipient)
    || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    res.status(400).json({ error: "A valid business, recipient, and idempotency key are required" });
    return;
  }
  const key = createHash("sha256").update(`${id}:${idempotencyKey}`).digest("hex");
  const user = getRequestUser(req);
  const actorUserId = getRequestUserId(req) ?? null;
  const actorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null;

  let context: {
    attemptId: number;
    revisionId: number;
    revision: number;
    token: string;
    quoteNumber: string;
    title: string;
    customerSnapshot: Record<string, unknown>;
    pdfBuffer: Buffer | null;
    pdfDocument: Awaited<ReturnType<typeof buildEstimateQuoteSnapshot>>["pdfDocument"] | null;
    logo: Awaited<ReturnType<typeof buildEstimateQuoteSnapshot>>["logo"];
    createdRevision: boolean;
    businessId: number;
  };
  try {
    const prepared = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM estimates WHERE id = ${id} FOR UPDATE`);
      const [existingAttempt] = await tx.select().from(estimateQuoteEventsTable)
        .where(eq(estimateQuoteEventsTable.idempotencyKey, key)).limit(1);
      if (existingAttempt) return { conflict: true as const };

      const [row] = await tx.select({
        ...getTableColumns(estimatesTable),
        clientName: clientsTable.name,
        clientEmail: clientsTable.email,
        clientPhone: clientsTable.phone,
        clientAddress: clientsTable.address,
        clientCity: clientsTable.city,
        clientState: clientsTable.state,
        clientZip: clientsTable.zip,
      }).from(estimatesTable)
        .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
        .where(eq(estimatesTable.id, id));
      if (!row || !belongsToBusinessReadScope(row, scope)) return { missing: true as const };

      const active = await tx.select().from(estimateQuoteEventsTable).where(and(
        eq(estimateQuoteEventsTable.estimateId, id),
        sql`${estimateQuoteEventsTable.status} IN ('pending', 'unresolved')`,
      )).limit(1);
      if (active.length) return { conflict: true as const };

      const business = row.businessId
        ? (await tx.select().from(businessesTable).where(eq(businessesTable.id, row.businessId)).limit(1))[0]
        : (await tx.select().from(businessesTable).where(eq(businessesTable.slug, row.businessLine ?? "")).limit(1))[0];
      if (!business) return { conflict: true as const };
      const settings = (await tx.select().from(settingsTable).limit(1))[0] ?? null;
      const [latest] = await tx.select().from(estimateQuoteEventsTable).where(and(
        eq(estimateQuoteEventsTable.estimateId, id),
        eq(estimateQuoteEventsTable.eventType, "revision"),
      )).orderBy(desc(estimateQuoteEventsTable.revision)).limit(1);
      const revisionNumber = latest?.revision ?? 1;
      const expiry = row.quoteExpiresAt == null
        ? new Date(Date.now() + Math.min(365, Math.max(1, business.defaultQuoteValidityDays ?? 30)) * 86400000).toISOString().slice(0, 10)
        : String(row.quoteExpiresAt).slice(0, 10);
      let built = await buildEstimateQuoteSnapshot({
        estimate: row as never,
        business,
        settings,
        revision: revisionNumber,
        expiresAt: expiry,
      });
      let revisionRow = latest;
      let createdRevision = false;
      if (!latest || latest.contentHash !== built.contentHash) {
        const nextRevision = latest ? latest.revision + 1 : 1;
        built = await buildEstimateQuoteSnapshot({
          estimate: row as never,
          business,
          settings,
          revision: nextRevision,
          expiresAt: expiry,
        });
        const token = getEstimateQuoteToken(id, nextRevision, built.contentHash);
        [revisionRow] = await tx.insert(estimateQuoteEventsTable).values({
          estimateId: id,
          businessId: business.id,
          revision: nextRevision,
          eventType: "revision",
          status: "snapshot",
          tokenHash: hashEstimateQuoteToken(token),
          tokenExpiresAt: new Date(`${expiry}T23:59:59.999Z`),
          contentHash: built.contentHash,
          customerSnapshot: built.customerSnapshot,
          logoContentType: built.logo?.mimeType ?? null,
          metadata: {},
        }).returning();
        createdRevision = true;
      }
      if (!revisionRow) return { conflict: true as const };
      const token = getEstimateQuoteToken(id, revisionRow.revision, revisionRow.contentHash ?? "");
      if (revisionRow.tokenHash !== hashEstimateQuoteToken(token)) return { conflict: true as const };
      const [attempt] = await tx.insert(estimateQuoteEventsTable).values({
        estimateId: id,
        businessId: business.id,
        revisionSnapshotId: revisionRow.id,
        revision: revisionRow.revision,
        eventType: "send_attempt",
        status: "pending",
        recipient,
        actorUserId,
        actorName,
        idempotencyKey: key,
        requestedAt: new Date(),
        metadata: {},
      }).returning();
      let pdfBuffer: Buffer | null = null;
      if (revisionRow.pdfObjectPath && !createdRevision) {
        const file = await storage.getObjectEntityFile(revisionRow.pdfObjectPath);
        const [downloaded] = await file.download();
        pdfBuffer = downloaded as Buffer;
      }
      return {
        attemptId: attempt.id,
        revisionId: revisionRow.id,
        revision: revisionRow.revision,
        token,
        quoteNumber: built.customerSnapshot.quoteNumber,
        title: built.customerSnapshot.title,
        customerSnapshot: revisionRow.customerSnapshot as Record<string, unknown>,
        pdfBuffer,
        pdfDocument: pdfBuffer ? null : built.pdfDocument,
        logo: built.logo,
        createdRevision,
        businessId: business.id,
      };
    });
    if ("missing" in prepared) {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    if ("conflict" in prepared) {
      res.status(409).json({ error: "A quote send is already pending or unresolved, or the send key was already used." });
      return;
    }
    context = prepared;
  } catch (error) {
    const message = error instanceof Error && error.name === "EstimateQuoteTotalsMismatchError"
      ? "Customer pricing does not reconcile with the saved estimate."
      : "Unable to prepare this quote for sending.";
    res.status(409).json({ error: message });
    return;
  }

  let archive: { pdfObjectPath: string; logoObjectPath: string | null } | null = null;
  try {
    let pdf = context.pdfBuffer;
    if (!pdf && context.pdfDocument) {
      pdf = await generateEstimateQuotePdf(context.pdfDocument);
      archive = await stageEstimateQuoteArchive({
        estimateId: id,
        revision: context.revision,
        pdf,
        logo: context.logo,
      });
      await db.update(estimateQuoteEventsTable).set({
        pdfObjectPath: archive.pdfObjectPath,
        logoObjectPath: archive.logoObjectPath,
        logoContentType: context.logo?.mimeType ?? null,
      }).where(and(
        eq(estimateQuoteEventsTable.id, context.revisionId),
        eq(estimateQuoteEventsTable.eventType, "revision"),
      ));
    }
    if (!pdf) throw new Error("Quote PDF is unavailable");
    const quoteUrl = `${publicOrigin}/quote/${context.token}`;
    const subject = `Quote ${context.quoteNumber} — ${context.title}`;
    const html = `<p>Hello${context.customerSnapshot.customerName ? ` ${escapeHtml(String(context.customerSnapshot.customerName))}` : ""},</p><p>Your quote is ready for review.</p><p><a href="${quoteUrl}">Review quote ${escapeHtml(context.quoteNumber)}</a></p><p>The PDF is attached for your records.</p>`;
    const delivery = await sendEmail({
      to: recipient,
      subject,
      html,
      text: `Your quote ${context.quoteNumber} is ready: ${quoteUrl}`,
      attachment: {
        filename: `${context.quoteNumber}-revision-${context.revision}.pdf`,
        mimeType: "application/pdf",
        base64Data: pdf.toString("base64"),
      },
      headers: { "X-BuildPro-Quote-Event-ID": String(context.attemptId) },
    });
    if (!delivery.messageId) {
      await db.update(estimateQuoteEventsTable).set({
        status: "unresolved",
        provider: delivery.provider,
        providerThreadId: delivery.threadId ?? null,
        errorMessage: "Provider acceptance did not return a message ID.",
        completedAt: new Date(),
      }).where(eq(estimateQuoteEventsTable.id, context.attemptId));
      res.status(202).json({ status: "unresolved", revision: context.revision, eventId: context.attemptId, message: "The send outcome needs reconciliation before another attempt." });
      return;
    }
    await db.update(estimateQuoteEventsTable).set({
      status: "accepted",
      provider: delivery.provider,
      providerMessageId: delivery.messageId,
      providerThreadId: delivery.threadId ?? null,
      completedAt: new Date(),
    }).where(eq(estimateQuoteEventsTable.id, context.attemptId));
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT id FROM estimates WHERE id = ${id} FOR UPDATE`);
        await tx.update(estimateQuoteEventsTable).set({ tokenActivatedAt: new Date(), status: "accepted" })
          .where(eq(estimateQuoteEventsTable.id, context.revisionId));
        await tx.update(estimateQuoteEventsTable).set({ tokenRevokedAt: new Date() }).where(and(
          eq(estimateQuoteEventsTable.estimateId, id),
          eq(estimateQuoteEventsTable.eventType, "revision"),
          sql`${estimateQuoteEventsTable.id} <> ${context.revisionId}`,
          isNull(estimateQuoteEventsTable.tokenRevokedAt),
        ));
        await tx.update(estimatesTable).set({ status: "sent" })
          .where(and(eq(estimatesTable.id, id), eq(estimatesTable.status, "draft")));
      });
    } catch {
      await db.update(estimateQuoteEventsTable).set({
        status: "unresolved",
        errorMessage: "The provider accepted the message; owner reconciliation is required.",
      }).where(eq(estimateQuoteEventsTable.id, context.attemptId));
      res.status(202).json({ status: "unresolved", revision: context.revision, eventId: context.attemptId, message: "The email was accepted but needs reconciliation before the link is activated." });
      return;
    }
    res.json({ status: "accepted", revision: context.revision, eventId: context.attemptId, message: "Quote accepted by the email provider." });
  } catch (error) {
    const definite = error instanceof EmailProviderRejectedError;
    await db.update(estimateQuoteEventsTable).set({
      status: definite ? "failed" : "unresolved",
      errorMessage: definite ? "The email provider rejected the message." : "The send outcome is uncertain; do not retry until reconciled.",
      completedAt: new Date(),
    }).where(eq(estimateQuoteEventsTable.id, context.attemptId));
    if (definite && archive) {
      const [revision] = await db.select({ tokenActivatedAt: estimateQuoteEventsTable.tokenActivatedAt })
        .from(estimateQuoteEventsTable).where(eq(estimateQuoteEventsTable.id, context.revisionId));
      if (!revision?.tokenActivatedAt) {
        await removeStagedEstimateQuoteArchive(archive, storage);
        await db.update(estimateQuoteEventsTable).set({ pdfObjectPath: null, logoObjectPath: null })
          .where(eq(estimateQuoteEventsTable.id, context.revisionId));
      }
    }
    res.status(definite ? 502 : 202).json({
      status: definite ? "failed" : "unresolved",
      revision: context.revision,
      eventId: context.attemptId,
      message: definite ? "The email provider rejected the quote. You may retry." : "The send outcome is uncertain; reconcile it before retrying.",
    });
  }
});

router.post("/:id/quote-events/:eventId/reconcile", async (req, res): Promise<void> => {
  const userId = getRequestUserId(req);
  const ownerId = await getOwnerId();
  if (!userId || userId !== ownerId) {
    res.status(403).json({ error: "Owner access required" });
    return;
  }
  const id = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  const messageId = typeof req.body?.providerMessageId === "string" ? req.body.providerMessageId.trim() : "";
  const threadId = typeof req.body?.providerThreadId === "string" ? req.body.providerThreadId.trim() : null;
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(eventId) || !messageId) {
    res.status(400).json({ error: "Provider message evidence is required" });
    return;
  }
  const [attempt] = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.id, eventId),
    eq(estimateQuoteEventsTable.estimateId, id),
    eq(estimateQuoteEventsTable.eventType, "send_attempt"),
  )).limit(1);
  if (!attempt || !["pending", "unresolved"].includes(attempt.status) || !attempt.revisionSnapshotId) {
    res.status(409).json({ error: "This quote send is not awaiting reconciliation" });
    return;
  }
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM estimates WHERE id = ${id} FOR UPDATE`);
    await tx.update(estimateQuoteEventsTable).set({
      status: "accepted",
      provider: "gmail",
      providerMessageId: messageId,
      providerThreadId: threadId,
      completedAt: new Date(),
      errorMessage: null,
    }).where(eq(estimateQuoteEventsTable.id, eventId));
    await tx.update(estimateQuoteEventsTable).set({ tokenActivatedAt: new Date(), status: "accepted" })
      .where(eq(estimateQuoteEventsTable.id, attempt.revisionSnapshotId!));
    await tx.update(estimateQuoteEventsTable).set({ tokenRevokedAt: new Date() }).where(and(
      eq(estimateQuoteEventsTable.estimateId, id),
      eq(estimateQuoteEventsTable.eventType, "revision"),
      sql`${estimateQuoteEventsTable.id} <> ${attempt.revisionSnapshotId}`,
      isNull(estimateQuoteEventsTable.tokenRevokedAt),
    ));
    await tx.update(estimatesTable).set({ status: "sent" })
      .where(and(eq(estimatesTable.id, id), eq(estimatesTable.status, "draft")));
  });
  const [updated] = await db.select().from(estimateQuoteEventsTable).where(eq(estimateQuoteEventsTable.id, eventId));
  res.json(safeEvent(updated!));
});

export default router;
