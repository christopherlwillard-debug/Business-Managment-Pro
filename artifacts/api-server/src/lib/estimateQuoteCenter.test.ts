import { describe, expect, it } from "vitest";
import { buildEstimateQuoteCenter } from "./estimateQuoteCenter.js";

const baseEstimate = {
  id: 12,
  title: "Kitchen update",
  clientName: "Jordan Lee",
  businessId: 4,
  jobId: null,
  total: "999.00",
};

function quoteEvents(now: Date, extras: Array<Record<string, unknown>> = []) {
  const sentAt = new Date(now.getTime() - 4 * 86400000);
  return [
    {
      id: 100,
      estimateId: 12,
      businessId: 4,
      revisionSnapshotId: null,
      revision: 1,
      eventType: "revision",
      status: "accepted",
      requestedAt: sentAt,
      createdAt: sentAt,
      tokenExpiresAt: new Date(now.getTime() + 10 * 86400000),
      customerSnapshot: { total: 1250.5 },
    },
    {
      id: 101,
      estimateId: 12,
      businessId: 4,
      revisionSnapshotId: 100,
      revision: 1,
      eventType: "send_attempt",
      status: "accepted",
      requestedAt: sentAt,
      createdAt: sentAt,
      metadata: {},
    },
    ...extras,
  ] as never[];
}

describe("buildEstimateQuoteCenter", () => {
  it("keeps online acceptance separate from authorization and uses frozen revision value", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    const result = buildEstimateQuoteCenter(
      [baseEstimate as never],
      quoteEvents(now, [{
        id: 102,
        estimateId: 12,
        businessId: 4,
        revisionSnapshotId: 100,
        revision: 1,
        eventType: "response",
        status: "recorded",
        responseType: "approved",
        requestedAt: new Date(now.getTime() - 3600000),
        createdAt: now,
        metadata: {},
      }]),
      now,
    );

    expect(result.items[0]).toMatchObject({
      documentStatus: "sent",
      decision: "approved",
      authorizationStatus: "not_authorized",
      total: 1250.5,
    });
    expect(result.summary.acceptedValue).toBe(1250.5);
    expect(result.summary.authorizedValue).toBe(0);
  });

  it("offers the three-day reminder first and suppresses it after completion", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    const base = quoteEvents(now);
    const due = buildEstimateQuoteCenter([baseEstimate as never], base, now);
    expect(due.items[0].followUpDue).toBe(true);
    expect(due.items[0].nextFollowUpSource).toBe("three_day");
    expect(due.summary.followUpsDueCount).toBe(1);

    const completed = buildEstimateQuoteCenter([baseEstimate as never], [
      ...base,
      {
        id: 103,
        estimateId: 12,
        businessId: 4,
        revisionSnapshotId: 100,
        relatedEventId: 101,
        revision: 1,
        eventType: "follow_up_completed",
        status: "completed",
        requestedAt: now,
        createdAt: now,
        metadata: { reminderDay: 3 },
      },
    ] as never[], now);
    expect(completed.items[0].nextFollowUpSource).toBe("seven_day");
    expect(completed.items[0].followUpDue).toBe(false);
  });

  it("archives and restores without changing the decision or authorization history", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    const common = quoteEvents(now, [{
      id: 102,
      estimateId: 12,
      businessId: 4,
      revisionSnapshotId: 100,
      revision: 1,
      eventType: "work_authorization",
      status: "authorized",
      requestedAt: new Date(now.getTime() - 3600000),
      createdAt: now,
      metadata: { confirmed: true },
    }]);
    const archived = buildEstimateQuoteCenter([baseEstimate as never], [
      ...common,
      {
        id: 103,
        estimateId: 12,
        businessId: 4,
        revisionSnapshotId: 100,
        revision: 1,
        eventType: "archive",
        status: "archived",
        requestedAt: now,
        createdAt: now,
        metadata: {},
      },
    ] as never[], now);
    expect(archived.items[0].documentStatus).toBe("archived");
    expect(archived.items[0].authorizationStatus).toBe("authorized");

    const restored = buildEstimateQuoteCenter([baseEstimate as never], [
      ...common,
      {
        id: 103,
        estimateId: 12,
        businessId: 4,
        revisionSnapshotId: 100,
        revision: 1,
        eventType: "archive",
        status: "archived",
        requestedAt: new Date(now.getTime() - 2000),
        createdAt: now,
        metadata: {},
      },
      {
        id: 104,
        estimateId: 12,
        businessId: 4,
        revisionSnapshotId: 100,
        revision: 1,
        eventType: "restore",
        status: "restored",
        requestedAt: now,
        createdAt: now,
        metadata: {},
      },
    ] as never[], now);
    expect(restored.items[0].documentStatus).toBe("sent");
    expect(restored.items[0].authorizationStatus).toBe("authorized");
  });
});
