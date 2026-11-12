import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  clientsTable,
  estimateQuoteEventsTable,
  estimatesTable,
  settingsTable,
} from "@workspace/db/schema";
import {
  RecordManualEstimateQuoteResponseBody,
  RecordEstimateWorkAuthorizationBody,
  ScheduleEstimateQuoteFollowUpBody,
  CompleteEstimateQuoteFollowUpBody,
} from "@workspace/api-zod";
import {
  businessReadPredicate,
  belongsToBusinessReadScope,
  requestedBusinessReadScope,
  invalidBusinessScope,
  hasRequestedBusiness,
} from "../lib/business-scope.js";
import { buildEstimateQuoteCenter } from "../lib/estimateQuoteCenter.js";
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
    responseAt: event.eventType === "response" || event.eventType === "manual_response"
      ? event.requestedAt
      : null,
    errorMessage: event.errorMessage,
    relatedEventId: event.relatedEventId,
    dueAt: event.dueAt,
    metadata: event.metadata,
  };
}

async function scopedEstimate(req: Request, res: Response, id: number) {
  const scopeRequest = {
    ...req,
    query: {
      ...req.query,
      businessId: req.query.businessId ?? req.body?.businessId,
      businessLine: req.query.businessLine ?? req.body?.businessLine,
    },
  } as unknown as Request;
  const scope = await requestedBusinessReadScope(scopeRequest);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return null;
  if (!scope || !Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "A valid estimate and business are required" });
    return null;
  }
  const [estimate] = await db.select().from(estimatesTable).where(eq(estimatesTable.id, id));
  if (!estimate || !belongsToBusinessReadScope(estimate, scope)) {
    res.status(404).json({ error: "Estimate not found" });
    return null;
  }
  return { estimate, scope };
}

function eventActor(req: Request) {
  const user = getRequestUser(req);
  return {
    actorUserId: getRequestUserId(req) ?? null,
    actorName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null,
  };
}

function eventIdempotencyKey(estimateId: number, action: string, key: string) {
  return createHash("sha256").update(`${estimateId}:${action}:${key}`).digest("hex");
}

router.get("/quote-center", async (req, res): Promise<void> => {
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  if (!scope) {
    res.status(400).json({ error: "A business scope is required" });
    return;
  }
  const rows = await db.select({
    ...getTableColumns(estimatesTable),
    clientName: clientsTable.name,
  }).from(estimatesTable)
    .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
    .where(businessReadPredicate(estimatesTable, scope));
  const ids = rows.map((row) => row.id);
  const events = ids.length
    ? await db.select().from(estimateQuoteEventsTable).where(inArray(estimateQuoteEventsTable.estimateId, ids))
    : [];
  res.json(buildEstimateQuoteCenter(rows as never, events));
});

router.post("/:id/quote-events/manual-response", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const scoped = await scopedEstimate(req, res, id);
  if (!scoped) return;
  const parsed = RecordManualEstimateQuoteResponseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid manual response" });
    return;
  }
  const input = parsed.data;
  const [revision] = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.id, input.revisionSnapshotId),
    eq(estimateQuoteEventsTable.estimateId, id),
    eq(estimateQuoteEventsTable.eventType, "revision"),
  )).limit(1);
  if (!revision) {
    res.status(404).json({ error: "Quote revision not found" });
    return;
  }
  const idempotencyKey = eventIdempotencyKey(id, "manual-response", input.idempotencyKey);
  const [event] = await db.insert(estimateQuoteEventsTable).values({
    estimateId: id,
    businessId: revision.businessId,
    revisionSnapshotId: revision.id,
    revision: revision.revision,
    eventType: "manual_response",
    status: "recorded",
    responseType: input.responseType,
    responseText: input.responseText ?? null,
    actorUserId: eventActor(req).actorUserId,
    actorName: eventActor(req).actorName,
    requestedAt: new Date(),
    completedAt: new Date(),
    idempotencyKey,
    metadata: {
      source: "manual",
      method: input.method,
      contactName: input.contactName ?? null,
      reference: input.reference ?? null,
    },
  }).onConflictDoNothing().returning();
  if (!event) {
    res.status(409).json({ error: "This manual response was already recorded" });
    return;
  }
  res.status(201).json(safeEvent(event));
});

router.post("/:id/quote-events/work-authorization", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const scoped = await scopedEstimate(req, res, id);
  if (!scoped) return;
  const parsed = RecordEstimateWorkAuthorizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Explicit authorization confirmation is required" });
    return;
  }
  const input = parsed.data;
  const [revision] = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.id, input.revisionSnapshotId),
    eq(estimateQuoteEventsTable.estimateId, id),
    eq(estimateQuoteEventsTable.eventType, "revision"),
  )).limit(1);
  if (!revision) {
    res.status(404).json({ error: "Quote revision not found" });
    return;
  }
  const [latest] = await db.select({ id: estimateQuoteEventsTable.id })
    .from(estimateQuoteEventsTable)
    .where(and(eq(estimateQuoteEventsTable.estimateId, id), eq(estimateQuoteEventsTable.eventType, "revision")))
    .orderBy(desc(estimateQuoteEventsTable.revision))
    .limit(1);
  const decisions = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.revisionSnapshotId, revision.id),
    inArray(estimateQuoteEventsTable.eventType, ["response", "manual_response"]),
  ));
  const latestDecision = decisions.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
  if (latest?.id !== revision.id || latestDecision?.responseType !== "approved") {
    res.status(409).json({ error: "Only the currently accepted revision can be authorized" });
    return;
  }
  const [existingAuthorization] = await db.select({ id: estimateQuoteEventsTable.id })
    .from(estimateQuoteEventsTable)
    .where(and(
      eq(estimateQuoteEventsTable.revisionSnapshotId, revision.id),
      eq(estimateQuoteEventsTable.eventType, "work_authorization"),
    ))
    .limit(1);
  if (existingAuthorization) {
    res.status(409).json({ error: "Work authorization is already recorded for this revision" });
    return;
  }
  const actor = eventActor(req);
  const [event] = await db.insert(estimateQuoteEventsTable).values({
    estimateId: id,
    businessId: revision.businessId,
    revisionSnapshotId: revision.id,
    revision: revision.revision,
    eventType: "work_authorization",
    status: "authorized",
    actorUserId: actor.actorUserId,
    actorName: actor.actorName,
    requestedAt: new Date(),
    completedAt: new Date(),
    idempotencyKey: eventIdempotencyKey(id, "work-authorization", input.idempotencyKey),
    metadata: { note: input.note ?? null, confirmed: true },
  }).onConflictDoNothing().returning();
  if (!event) {
    res.status(409).json({ error: "Work authorization was already recorded" });
    return;
  }
  res.status(201).json(safeEvent(event));
});

router.post("/:id/quote-events/follow-ups", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const scoped = await scopedEstimate(req, res, id);
  if (!scoped) return;
  const parsed = ScheduleEstimateQuoteFollowUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid follow-up schedule" });
    return;
  }
  const input = parsed.data;
  const [revision] = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.id, input.revisionSnapshotId),
    eq(estimateQuoteEventsTable.estimateId, id),
    eq(estimateQuoteEventsTable.eventType, "revision"),
  )).limit(1);
  if (!revision) {
    res.status(404).json({ error: "Quote revision not found" });
    return;
  }
  const [latestRevision] = await db.select({ id: estimateQuoteEventsTable.id })
    .from(estimateQuoteEventsTable)
    .where(and(eq(estimateQuoteEventsTable.estimateId, id), eq(estimateQuoteEventsTable.eventType, "revision")))
    .orderBy(desc(estimateQuoteEventsTable.revision))
    .limit(1);
  if (latestRevision?.id !== revision.id) {
    res.status(409).json({ error: "Follow-ups can only be scheduled for the current revision" });
    return;
  }
  const revisionHistory = await db.select().from(estimateQuoteEventsTable)
    .where(eq(estimateQuoteEventsTable.estimateId, id));
  const alreadyResponded = revisionHistory.some((event) =>
    (event.eventType === "response" || event.eventType === "manual_response")
    && event.revisionSnapshotId === revision.id,
  );
  const currentlyArchived = revisionHistory
    .filter((event) => event.eventType === "archive" || event.eventType === "restore")
    .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0]?.eventType === "archive";
  const hasAcceptedSend = revisionHistory.some((event) =>
    event.eventType === "send_attempt"
    && event.status === "accepted"
    && event.revisionSnapshotId === revision.id,
  );
  if (alreadyResponded || currentlyArchived || !hasAcceptedSend) {
    res.status(409).json({ error: "Only unanswered sent quotes can have follow-ups" });
    return;
  }
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    res.status(400).json({ error: "A valid follow-up date is required" });
    return;
  }
  const actor = eventActor(req);
  const [event] = await db.insert(estimateQuoteEventsTable).values({
    estimateId: id,
    businessId: revision.businessId,
    revisionSnapshotId: revision.id,
    revision: revision.revision,
    eventType: "follow_up_scheduled",
    status: "scheduled",
    dueAt,
    actorUserId: actor.actorUserId,
    actorName: actor.actorName,
    requestedAt: new Date(),
    idempotencyKey: eventIdempotencyKey(id, "follow-up", input.idempotencyKey),
    metadata: { method: input.method ?? null, note: input.note ?? null },
  }).onConflictDoNothing().returning();
  if (!event) {
    res.status(409).json({ error: "This follow-up was already scheduled" });
    return;
  }
  res.status(201).json(safeEvent(event));
});

router.post("/:id/quote-events/:eventId/complete-follow-up", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  const scoped = await scopedEstimate(req, res, id);
  if (!scoped) return;
  const parsed = CompleteEstimateQuoteFollowUpBody.safeParse(req.body);
  if (!parsed.success || !Number.isSafeInteger(eventId) || eventId <= 0) {
    res.status(400).json({ error: "Invalid follow-up completion" });
    return;
  }
  const input = parsed.data;
  const [source] = await db.select().from(estimateQuoteEventsTable).where(and(
    eq(estimateQuoteEventsTable.id, eventId),
    eq(estimateQuoteEventsTable.estimateId, id),
  )).limit(1);
  const validSource = input.source === "scheduled"
    ? source?.eventType === "follow_up_scheduled" && source.status === "scheduled"
    : source?.eventType === "send_attempt" && source.status === "accepted";
  if (!source || !validSource || !source.revisionSnapshotId) {
    res.status(404).json({ error: "Follow-up is unavailable" });
    return;
  }
  const events = await db.select().from(estimateQuoteEventsTable)
    .where(eq(estimateQuoteEventsTable.estimateId, id));
  const latestRevision = events
    .filter((event) => event.eventType === "revision")
    .sort((a, b) => b.revision - a.revision)[0];
  const hasDecision = events.some((event) =>
    (event.eventType === "response" || event.eventType === "manual_response")
    && event.revisionSnapshotId === source.revisionSnapshotId,
  );
  if (latestRevision?.id !== source.revisionSnapshotId || hasDecision) {
    res.status(409).json({ error: "Follow-up is no longer active for this quote" });
    return;
  }
  const reminderDay = input.source === "three_day" ? 3 : input.source === "seven_day" ? 7 : null;
  const alreadyCompleted = events.some((event) =>
    event.eventType === "follow_up_completed"
    && event.relatedEventId === source.id
    && (input.source === "scheduled" || Number((event.metadata as Record<string, unknown> | null)?.reminderDay) === reminderDay),
  );
  if (alreadyCompleted) {
    res.status(409).json({ error: "This follow-up is already complete" });
    return;
  }
  if (input.source !== "scheduled") {
    const days = input.source === "three_day" ? 3 : 7;
    if (Date.now() < source.requestedAt.getTime() + days * 86400000) {
      res.status(409).json({ error: "This reminder is not due yet" });
      return;
    }
  }
  const actor = eventActor(req);
  const [event] = await db.insert(estimateQuoteEventsTable).values({
    estimateId: id,
    businessId: source.businessId,
    revisionSnapshotId: source.revisionSnapshotId,
    relatedEventId: source.id,
    revision: source.revision,
    eventType: "follow_up_completed",
    status: "completed",
    actorUserId: actor.actorUserId,
    actorName: actor.actorName,
    requestedAt: new Date(),
    completedAt: new Date(),
    idempotencyKey: eventIdempotencyKey(id, "follow-up-complete", input.idempotencyKey),
    metadata: {
      source: input.source,
      reminderDay,
      method: input.method ?? null,
      note: input.note ?? null,
    },
  }).onConflictDoNothing().returning();
  if (!event) {
    res.status(409).json({ error: "This follow-up completion was already recorded" });
    return;
  }
  res.status(201).json(safeEvent(event));
});

async function setQuoteArchiveState(req: Request, res: Response, id: number, archived: boolean): Promise<void> {
  const scoped = await scopedEstimate(req, res, id);
  if (!scoped) return;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM estimates WHERE id = ${id} FOR UPDATE`);
    const events = await tx.select().from(estimateQuoteEventsTable)
      .where(eq(estimateQuoteEventsTable.estimateId, id));
    const latestState = events
      .filter((event) => event.eventType === "archive" || event.eventType === "restore")
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
    if (Boolean(latestState?.eventType === "archive") === archived) return null;
    const revision = events
      .filter((event) => event.eventType === "revision")
      .sort((a, b) => b.revision - a.revision)[0];
    const hasSentRevision = revision && events.some((event) =>
      event.eventType === "send_attempt"
      && event.status === "accepted"
      && event.revisionSnapshotId === revision.id,
    );
    if (!revision || (archived && !hasSentRevision)) return null;
    const actor = eventActor(req);
    const [event] = await tx.insert(estimateQuoteEventsTable).values({
      estimateId: id,
      businessId: revision.businessId,
      revisionSnapshotId: revision.id,
      revision: revision.revision,
      eventType: archived ? "archive" : "restore",
      status: archived ? "archived" : "restored",
      actorUserId: actor.actorUserId,
      actorName: actor.actorName,
      requestedAt: new Date(),
      completedAt: new Date(),
      metadata: {},
    }).returning();
    return event;
  });
  if (!result) {
    res.status(409).json({ error: archived ? "Only sent quotes can be archived" : "Quote is not archived" });
    return;
  }
  res.status(201).json(safeEvent(result));
}

router.post("/:id/archive", async (req, res): Promise<void> => {
  await setQuoteArchiveState(req, res, Number(req.params.id), true);
});

router.post("/:id/restore", async (req, res): Promise<void> => {
  await setQuoteArchiveState(req, res, Number(req.params.id), false);
});

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

router.post("/:id/quote-preview", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const scoped = await scopedEstimate(req, res, id);
  if (!scoped) return;
  let stagedArchive: { pdfObjectPath: string; logoObjectPath: string | null } | null = null;
  let archiveCommitted = false;

  try {
    const prepared = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM estimates WHERE id = ${id} FOR UPDATE`);
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
      if (!row || !belongsToBusinessReadScope(row, scoped.scope)) return { missing: true as const };

      const business = row.businessId
        ? (await tx.select().from(businessesTable).where(eq(businessesTable.id, row.businessId)).limit(1))[0]
        : (await tx.select().from(businessesTable).where(eq(businessesTable.slug, row.businessLine ?? "")).limit(1))[0];
      if (!business) return { conflict: true as const };
      const settings = (await tx.select().from(settingsTable).limit(1))[0] ?? null;
      const [latest] = await tx.select().from(estimateQuoteEventsTable).where(and(
        eq(estimateQuoteEventsTable.estimateId, id),
        eq(estimateQuoteEventsTable.eventType, "revision"),
      )).orderBy(desc(estimateQuoteEventsTable.revision)).limit(1);
      const expiresAt = row.quoteExpiresAt == null
        ? new Date(Date.now() + Math.min(365, Math.max(1, business.defaultQuoteValidityDays ?? 30)) * 86400000).toISOString().slice(0, 10)
        : String(row.quoteExpiresAt).slice(0, 10);
      let revisionNumber = latest?.revision ?? 1;
      let built = await buildEstimateQuoteSnapshot({
        estimate: row as never,
        business,
        settings,
        revision: revisionNumber,
        expiresAt,
      });
      let revisionRow = latest;

      if (!latest || latest.contentHash !== built.contentHash) {
        revisionNumber = latest ? latest.revision + 1 : 1;
        built = await buildEstimateQuoteSnapshot({
          estimate: row as never,
          business,
          settings,
          revision: revisionNumber,
          expiresAt,
        });
        const pdf = await generateEstimateQuotePdf(built.pdfDocument);
        stagedArchive = await stageEstimateQuoteArchive({
          estimateId: id,
          revision: revisionNumber,
          pdf,
          logo: built.logo,
          storage,
        });
        const token = getEstimateQuoteToken(id, revisionNumber, built.contentHash);
        [revisionRow] = await tx.insert(estimateQuoteEventsTable).values({
          estimateId: id,
          businessId: business.id,
          revision: revisionNumber,
          eventType: "revision",
          status: "snapshot",
          tokenHash: hashEstimateQuoteToken(token),
          tokenExpiresAt: new Date(`${expiresAt}T23:59:59.999Z`),
          contentHash: built.contentHash,
          customerSnapshot: built.customerSnapshot,
          pdfObjectPath: stagedArchive.pdfObjectPath,
          logoObjectPath: stagedArchive.logoObjectPath,
          logoContentType: built.logo?.mimeType ?? null,
          metadata: {},
        }).returning();
      } else if (!latest.pdfObjectPath) {
        const pdf = await generateEstimateQuotePdf(built.pdfDocument);
        stagedArchive = await stageEstimateQuoteArchive({
          estimateId: id,
          revision: revisionNumber,
          pdf,
          logo: built.logo,
          storage,
        });
        [revisionRow] = await tx.update(estimateQuoteEventsTable).set({
          pdfObjectPath: stagedArchive.pdfObjectPath,
          logoObjectPath: stagedArchive.logoObjectPath,
          logoContentType: built.logo?.mimeType ?? null,
        }).where(eq(estimateQuoteEventsTable.id, latest.id)).returning();
      }

      if (!revisionRow?.pdfObjectPath) return { conflict: true as const };
      return {
        revisionEventId: revisionRow.id,
        revision: revisionRow.revision,
        title: built.customerSnapshot.title,
        quoteNumber: built.customerSnapshot.quoteNumber,
        total: built.customerSnapshot.total,
      };
    });
    if ("missing" in prepared) {
      if (stagedArchive) await removeStagedEstimateQuoteArchive(stagedArchive, storage);
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    if ("conflict" in prepared) {
      if (stagedArchive) await removeStagedEstimateQuoteArchive(stagedArchive, storage);
      res.status(409).json({
        error: "Could not prepare this quote revision. Refresh and try again.",
        code: "preview_failed",
      });
      return;
    }
    archiveCommitted = stagedArchive != null;
    res.json(prepared);
  } catch (error) {
    if (stagedArchive && !archiveCommitted) {
      await removeStagedEstimateQuoteArchive(stagedArchive, storage);
    }
    const message = error instanceof Error && error.name === "EstimateQuoteTotalsMismatchError"
      ? "Customer pricing does not reconcile with the saved estimate. Review the estimate before sending."
      : "Unable to prepare the quote PDF. No email was sent.";
    res.status(409).json({
      error: message,
      code: error instanceof Error && error.name === "EstimateQuoteTotalsMismatchError"
        ? "pricing_mismatch"
        : "preview_failed",
    });
  }
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
    res.setHeader(
      "Content-Disposition",
      `${req.query.inline === "1" ? "inline" : "attachment"}; filename="quote-revision-${revision.revision}.pdf"`,
    );
    res.send(buffer);
  } catch {
    res.status(404).json({ error: "Quote revision file not found" });
  }
});

router.post("/:id/send", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const revisionEventId = Number(req.body?.revisionEventId);
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
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(revisionEventId) || revisionEventId <= 0
    || !scope || recipient.length > 254 || !emailPattern.test(recipient)
    || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    res.status(400).json({ error: "A reviewed quote revision, business, recipient, and idempotency key are required" });
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
      const [reviewedRevision] = await tx.select().from(estimateQuoteEventsTable).where(and(
        eq(estimateQuoteEventsTable.id, revisionEventId),
        eq(estimateQuoteEventsTable.estimateId, id),
        eq(estimateQuoteEventsTable.eventType, "revision"),
      )).limit(1);
      const [latest] = await tx.select().from(estimateQuoteEventsTable).where(and(
        eq(estimateQuoteEventsTable.estimateId, id),
        eq(estimateQuoteEventsTable.eventType, "revision"),
      )).orderBy(desc(estimateQuoteEventsTable.revision)).limit(1);
      if (!reviewedRevision || !latest || latest.id !== reviewedRevision.id
        || !["snapshot", "accepted"].includes(reviewedRevision.status)
        || reviewedRevision.tokenRevokedAt
        || !reviewedRevision.pdfObjectPath
        || !reviewedRevision.contentHash
        || !belongsToBusinessReadScope({ businessId: reviewedRevision.businessId }, scope)) {
        return { stale: true as const };
      }
      const expiry = reviewedRevision.customerSnapshot
        && typeof reviewedRevision.customerSnapshot === "object"
        && "expiresAt" in reviewedRevision.customerSnapshot
        ? String((reviewedRevision.customerSnapshot as Record<string, unknown>).expiresAt ?? "")
        : row.quoteExpiresAt == null
          ? new Date(Date.now() + Math.min(365, Math.max(1, business.defaultQuoteValidityDays ?? 30)) * 86400000).toISOString().slice(0, 10)
          : String(row.quoteExpiresAt).slice(0, 10);
      const built = await buildEstimateQuoteSnapshot({
        estimate: row as never,
        business,
        settings,
        revision: reviewedRevision.revision,
        expiresAt: expiry,
      });
      if (built.contentHash !== reviewedRevision.contentHash) return { stale: true as const };
      const token = getEstimateQuoteToken(id, reviewedRevision.revision, reviewedRevision.contentHash);
      if (reviewedRevision.tokenHash !== hashEstimateQuoteToken(token)) return { stale: true as const };
      const file = await storage.getObjectEntityFile(reviewedRevision.pdfObjectPath);
      const [downloaded] = await file.download();
      const pdfBuffer = downloaded as Buffer;
      if (!pdfBuffer.length) return { stale: true as const };
      const [attempt] = await tx.insert(estimateQuoteEventsTable).values({
        estimateId: id,
        businessId: business.id,
        revisionSnapshotId: reviewedRevision.id,
        revision: reviewedRevision.revision,
        eventType: "send_attempt",
        status: "pending",
        recipient,
        actorUserId,
        actorName,
        idempotencyKey: key,
        requestedAt: new Date(),
        metadata: {},
      }).returning();
      return {
        attemptId: attempt.id,
        revisionId: reviewedRevision.id,
        revision: reviewedRevision.revision,
        token,
        quoteNumber: String((reviewedRevision.customerSnapshot as Record<string, unknown>).quoteNumber ?? ""),
        title: built.customerSnapshot.title,
        customerSnapshot: reviewedRevision.customerSnapshot as Record<string, unknown>,
        pdfBuffer,
        pdfDocument: null,
        logo: null,
        createdRevision: false,
        businessId: business.id,
      };
    });
    if ("missing" in prepared) {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    if ("conflict" in prepared) {
      res.status(409).json({
        error: "A quote send is already pending or unresolved, or the send key was already used.",
        code: "send_conflict",
      });
      return;
    }
    if ("stale" in prepared) {
      res.status(409).json({
        error: "This estimate changed or the reviewed PDF is unavailable. Review the latest PDF before sending.",
        code: "stale_revision",
      });
      return;
    }
    context = prepared;
  } catch (error) {
    const message = error instanceof Error && error.name === "EstimateQuoteTotalsMismatchError"
      ? "Customer pricing does not reconcile with the saved estimate."
      : "Unable to prepare this quote for sending.";
    res.status(409).json({
      error: message,
      ...(error instanceof Error && error.name === "EstimateQuoteTotalsMismatchError" ? { code: "pricing_mismatch" } : {}),
    });
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
