import type { Estimate, EstimateQuoteEvent } from "@workspace/db/schema";

type QuoteCenterEstimate = Estimate & {
  clientName?: string | null;
};

type QuoteCenterItem = {
  estimateId: number;
  businessId: number | null;
  title: string;
  clientName: string | null;
  total: number;
  jobId: number | null;
  revisionSnapshotId: number | null;
  revision: number;
  documentStatus: "draft" | "sent" | "viewed" | "expired" | "archived";
  decision: "approved" | "declined" | "changes_requested" | null;
  authorizationStatus: "not_authorized" | "authorized";
  nextFollowUpAt: string | null;
  nextFollowUpEventId: number | null;
  nextFollowUpSource: "scheduled" | "three_day" | "seven_day" | null;
  followUpDue: boolean;
};

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
};

const eventTime = (event: EstimateQuoteEvent) =>
  asDate(event.requestedAt)?.getTime() ?? asDate(event.createdAt)?.getTime() ?? 0;

const asMoney = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

function frozenTotal(revision: EstimateQuoteEvent | undefined, fallback: unknown): number {
  const snapshot = revision?.customerSnapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const total = (snapshot as Record<string, unknown>).total;
    if (total != null && Number.isFinite(Number(total))) return asMoney(total);
  }
  return asMoney(fallback);
}

export function buildEstimateQuoteCenter(
  estimates: QuoteCenterEstimate[],
  events: EstimateQuoteEvent[],
  now = new Date(),
) {
  const items: QuoteCenterItem[] = estimates.map((estimate) => {
    const related = events.filter((event) => event.estimateId === estimate.id);
    const revisions = related
      .filter((event) => event.eventType === "revision")
      .sort((a, b) => b.revision - a.revision || b.id - a.id);
    const revision = revisions[0];
    const revisionEvents = revision
      ? related.filter((event) => event.revisionSnapshotId === revision.id)
      : [];
    const acceptedSends = revisionEvents
      .filter((event) => event.eventType === "send_attempt" && event.status === "accepted")
      .sort((a, b) => eventTime(b) - eventTime(a));
    const latestSend = acceptedSends[0];
    const decisions = revisionEvents
      .filter((event) => event.eventType === "response" || event.eventType === "manual_response")
      .sort((a, b) => eventTime(b) - eventTime(a));
    const decision = decisions[0]?.responseType as QuoteCenterItem["decision"] | undefined;
    const archiveEvents = related
      .filter((event) => event.eventType === "archive" || event.eventType === "restore")
      .sort((a, b) => eventTime(b) - eventTime(a));
    const archived = archiveEvents[0]?.eventType === "archive";
    const expiry = asDate(revision?.tokenExpiresAt);
    const viewed = revisionEvents.some((event) => event.eventType === "view");

    let documentStatus: QuoteCenterItem["documentStatus"] = "draft";
    if (archived) documentStatus = "archived";
    else if (latestSend && expiry && expiry.getTime() <= now.getTime()) documentStatus = "expired";
    else if (latestSend && viewed) documentStatus = "viewed";
    else if (latestSend) documentStatus = "sent";

    const authorized = revisionEvents.some((event) => event.eventType === "work_authorization");
    const followUpCandidates: Array<{
      dueAt: Date;
      eventId: number;
      source: "scheduled" | "three_day" | "seven_day";
    }> = [];
    if (latestSend && !decision && !archived) {
      const completedMilestones = new Set(
        related
          .filter((event) => event.eventType === "follow_up_completed" && event.relatedEventId === latestSend.id)
          .map((event) => Number((event.metadata as Record<string, unknown> | null)?.reminderDay)),
      );
      for (const days of [3, 7]) {
        if (completedMilestones.has(days)) continue;
        const sentAt = asDate(latestSend.requestedAt);
        if (sentAt) followUpCandidates.push({
          dueAt: new Date(sentAt.getTime() + days * 86400000),
          eventId: latestSend.id,
          source: days === 3 ? "three_day" : "seven_day",
        });
      }
    }
    if (!decision && !archived) {
      const completedSchedules = new Set(
        related
          .filter((event) => event.eventType === "follow_up_completed" && event.relatedEventId != null)
          .map((event) => event.relatedEventId),
      );
      for (const scheduled of revisionEvents) {
        if (scheduled.eventType !== "follow_up_scheduled" || completedSchedules.has(scheduled.id)) continue;
        const dueAt = asDate(scheduled.dueAt);
        if (dueAt) followUpCandidates.push({ dueAt, eventId: scheduled.id, source: "scheduled" });
      }
    }
    followUpCandidates.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const nextFollowUp = followUpCandidates[0] ?? null;
    const total = frozenTotal(revision, estimate.total);
    return {
      estimateId: estimate.id,
      businessId: estimate.businessId ?? revision?.businessId ?? null,
      title: estimate.title,
      clientName: estimate.clientName ?? null,
      total,
      jobId: estimate.jobId ?? null,
      revisionSnapshotId: revision?.id ?? null,
      revision: revision?.revision ?? 0,
      documentStatus,
      decision: decision ?? null,
      authorizationStatus: authorized ? "authorized" : "not_authorized",
      nextFollowUpAt: nextFollowUp?.dueAt.toISOString() ?? null,
      nextFollowUpEventId: nextFollowUp?.eventId ?? null,
      nextFollowUpSource: nextFollowUp?.source ?? null,
      followUpDue: Boolean(nextFollowUp && nextFollowUp.dueAt.getTime() <= now.getTime()),
    };
  });

  const activeAwaiting = items.filter((item) =>
    (item.documentStatus === "sent" || item.documentStatus === "viewed")
    && item.decision == null,
  );
  const sum = (rows: QuoteCenterItem[]) => Math.round(rows.reduce((total, item) => total + item.total, 0) * 100) / 100;
  return {
    items,
    summary: {
      totalQuotes: items.length,
      draftCount: items.filter((item) => item.documentStatus === "draft").length,
      awaitingCount: activeAwaiting.length,
      viewedCount: items.filter((item) => item.documentStatus === "viewed" && item.decision == null).length,
      acceptedCount: items.filter((item) => item.decision === "approved").length,
      authorizedCount: items.filter((item) => item.authorizationStatus === "authorized").length,
      declinedCount: items.filter((item) => item.decision === "declined").length,
      expiredCount: items.filter((item) => item.documentStatus === "expired").length,
      followUpsDueCount: items.filter((item) => item.followUpDue).length,
      archivedCount: items.filter((item) => item.documentStatus === "archived").length,
      potentialValue: sum(activeAwaiting),
      acceptedValue: sum(items.filter((item) => item.decision === "approved")),
      authorizedValue: sum(items.filter((item) => item.authorizationStatus === "authorized")),
      convertedValue: sum(items.filter((item) => item.jobId != null)),
    },
  };
}
