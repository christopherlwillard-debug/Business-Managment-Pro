import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  consumedSlots: 0,
  missingSlots: [] as number[],
  scope: null as { id: number; slug: string } | null,
  insertResult: [] as any[],
  updatePayloads: [] as any[],
  updateResults: [] as any[][],
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: any) => any, reject: (error: any) => any) {
        const slot = h.consumedSlots++;
        const queued = h.selectQueue.shift();
        if (queued === undefined) {
          h.missingSlots.push(slot);
          return Promise.reject(new Error(`missing queued query slot [${slot}]`)).then(resolve, reject);
        }
        return Promise.resolve(queued).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve(h.insertResult),
        }),
      }),
      update: () => ({
        set: (payload: any) => {
          h.updatePayloads.push(payload);
          return {
            where: () => ({
              returning: () => Promise.resolve(h.updateResults.shift() ?? []),
            }),
          };
        },
      }),
      transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
        select: () => selectChain(),
        update: () => ({
          set: (payload: any) => {
            h.updatePayloads.push(payload);
            return {
              where: () => ({
                returning: () => Promise.resolve(h.updateResults.shift() ?? []),
              }),
            };
          },
        }),
      }),
    },
  };
});

vi.mock("../lib/business-scope", () => ({
  requestedBusiness: async () => h.scope,
  hasRequestedBusiness: (req: { query?: Record<string, unknown>; body?: Record<string, unknown> }) => (
    req.query?.businessId != null
    || req.query?.businessLine != null
    || req.body?.businessId != null
    || req.body?.businessLine != null
  ),
  invalidBusinessScope: () => false,
  businessPredicate: () => undefined,
}));

vi.mock("./guards", () => ({
  getRequestUser: () => ({ id: "user_1", firstName: "Test", lastName: "Reviewer" }),
}));

const { mfhLibraryRouter } = await import("./mfh");

const app = express();
app.use(express.json());
app.use("/mfh", mfhLibraryRouter);

const model = {
  id: 7,
  benchmarkId: 11,
  benchmarkJobType: "MFH Trim-Out",
  benchmarkHours: "24.00",
};

const jobs = [1, 2, 3].map((id) => ({
  id,
  title: `Production job ${id}`,
  status: "completed",
  workflow: "mh_production",
  businessId: null,
  mhProductionServices: [101],
}));

const presence = [1, 2, 3].map((jobId) => ({
  jobId,
  date: `2026-09-0${jobId}`,
  state: "here",
  provenance: "confirmed",
}));

const pendingRevision = {
  id: 21,
  benchmarkId: 11,
  mfhModelId: 7,
  priorBenchmarkHours: "24.00",
  proposedBenchmarkHours: "28.00",
  observedProductionDaysMedian: "1.00",
  observedProductionDaysMin: "1.00",
  observedProductionDaysMax: "1.00",
  sampleSize: 3,
  sourceJobIds: [1, 2, 3],
  status: "pending",
  reviewerNote: "The recent jobs consistently took longer.",
  createdByUserId: "user_1",
  createdByName: "Test Reviewer",
  createdAt: new Date("2026-09-10T12:00:00Z"),
  reviewedByUserId: null,
  reviewedByName: null,
  reviewedAt: null,
};

beforeEach(() => {
  h.selectQueue.length = 0;
  h.consumedSlots = 0;
  h.missingSlots.length = 0;
  h.scope = null;
  h.insertResult = [];
  h.updatePayloads.length = 0;
  h.updateResults.length = 0;
});

afterEach(() => {
  expect(h.missingSlots).toHaveLength(0);
  expect(h.selectQueue).toHaveLength(0);
});

function queueObservation() {
  h.selectQueue.push(
    [model],
    jobs,
    [{ id: 101, name: "Trim-Out", itemKey: "trim-out", appliesTo: "production", businessId: null }],
    [],
    presence,
    [],
  );
}

function queueCustomObservation({
  jobs: observationJobs,
  profiles = [],
  services = [{ id: 201, name: "Custom Exterior", itemKey: "custom", appliesTo: "production", businessId: null }],
}: {
  jobs: any[];
  profiles?: any[];
  services?: any[];
}) {
  h.selectQueue.push([model], observationJobs, services, profiles, presence, []);
}

describe("production benchmark reviews", () => {
  it("creates a pending review only from a sufficient all-business observation", async () => {
    queueObservation();
    h.insertResult = [{ ...pendingRevision }];

    const response = await request(app)
      .post("/mfh/knowledge-base/7/production-reviews")
      .send({ proposedBenchmarkHours: 28, reviewerNote: pendingRevision.reviewerNote });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "pending",
      priorBenchmarkHours: 24,
      proposedBenchmarkHours: 28,
      sampleSize: 3,
      sourceJobIds: [1, 2, 3],
    });
  });

  it("rejects a scoped review request before loading business-specific observations", async () => {
    h.scope = { id: 2, slug: "asphalt_sealing" };

    const response = await request(app)
      .post("/mfh/knowledge-base/7/production-reviews")
      .send({ proposedBenchmarkHours: 28 });

    expect(response.status).toBe(403);
    expect(h.consumedSlots).toBe(0);
  });

  it("includes a custom service only when its business has an explicit profile mapping", async () => {
    h.scope = { id: 1, slug: "general_contracting" };
    queueCustomObservation({
      jobs: [{
        ...jobs[0],
        businessId: 1,
        mhProductionServices: [201],
      }],
      profiles: [{
        businessId: 1,
        serviceTypeId: 201,
        profileId: 31,
        profileKey: "custom_exterior",
        profileName: "Custom Exterior",
      }],
    });

    const response = await request(app)
      .get("/mfh/knowledge-base/7/production-observations")
      .query({ businessId: 1 });

    expect(response.status).toBe(200);
    expect(response.body.jobs[0].serviceScopes).toEqual([{
      id: 201,
      name: "Custom Exterior",
      customProfile: { id: 31, key: "custom_exterior", name: "Custom Exterior" },
    }]);
  });

  it("excludes unmapped custom services and keeps mappings isolated by business", async () => {
    queueCustomObservation({
      jobs: [
        { ...jobs[0], id: 1, businessId: 1, mhProductionServices: [201] },
        { ...jobs[1], id: 2, businessId: 2, mhProductionServices: [201] },
      ],
      profiles: [{
        businessId: 1,
        serviceTypeId: 201,
        profileId: 31,
        profileKey: "custom_exterior",
        profileName: "Custom Exterior",
      }],
    });

    const response = await request(app)
      .get("/mfh/knowledge-base/7/production-observations");

    expect(response.status).toBe(200);
    expect(response.body.jobs[0].serviceScopes[0].customProfile.name).toBe("Custom Exterior");
    expect(response.body.jobs.map((job: { id: number }) => job.id)).toEqual([1]);
  });

  it("returns component production-day observations from exact snapshot sessions", async () => {
    const componentJobs = jobs.map((job) => ({
      ...job,
      mhProductionServices: [101],
    }));
    const components = componentJobs.map((job, index) => ({
      id: 500 + index,
      jobId: job.id,
      componentKey: "interior_finish",
      componentInstanceKey: "interior_finish:vog",
      componentLabel: "Interior Finish",
      variant: "vog",
      snapshotVersion: 2,
      status: "completed",
      expectedDurationDays: 2,
      knowledgeContext: null,
    }));
    const sessions = components.map((component, index) => ({
      id: 700 + index,
      jobId: component.jobId,
      productionComponentId: component.id,
      workDate: `2026-09-0${index + 1}`,
    }));
    h.selectQueue.push(
      [model],
      componentJobs,
      [{ id: 101, name: "Interior Finish VOG", itemKey: "vog", appliesTo: "production", businessId: null }],
      [],
      presence,
      components,
      sessions,
    );

    const response = await request(app)
      .get("/mfh/knowledge-base/7/production-observations");

    expect(response.status).toBe(200);
    expect(response.body.observed.componentObservations).toEqual([
      expect.objectContaining({
        learningKey: "interior_finish:vog",
        eligibleJobCount: 3,
        sufficient: true,
        expectedProductionDaysMedian: 2,
        actualWorkDaysMedian: 1,
      }),
    ]);
    expect(response.body.observed.componentObservations[0].jobs[0].snapshotEvidence).toEqual([
      expect.objectContaining({ snapshotId: 500, snapshotVersion: 2, sessionIds: [700] }),
    ]);
  });

  it("rejects a pending review without changing the active benchmark", async () => {
    h.selectQueue.push([{ ...pendingRevision }]);
    h.updateResults = [[{ ...pendingRevision, status: "rejected", reviewerNote: "Not enough context." }]];

    const response = await request(app)
      .patch("/mfh/knowledge-base/7/production-reviews/21/reject")
      .send({ reviewerNote: "Not enough context." });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("rejected");
    expect(h.updatePayloads).toEqual([expect.objectContaining({ status: "rejected", reviewerNote: "Not enough context." })]);
    expect(h.updatePayloads.some((payload) => "estimatedHours" in payload)).toBe(false);
  });

  it("approves a pending review transactionally and records the prior benchmark", async () => {
    h.selectQueue.push([{ ...pendingRevision }], [{ id: 11, estimatedHours: "24.00" }]);
    h.updateResults = [
      [{ id: 11, estimatedHours: "28.00" }],
      [{ ...pendingRevision, status: "approved", reviewedByName: "Test Reviewer" }],
    ];

    const response = await request(app)
      .patch("/mfh/knowledge-base/7/production-reviews/21/approve")
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("approved");
    expect(h.updatePayloads).toEqual([
      { estimatedHours: "28.00" },
      expect.objectContaining({ status: "approved", reviewedByUserId: "user_1" }),
    ]);
  });

  it("returns a stale conflict and performs no writes when the benchmark changed", async () => {
    h.selectQueue.push([{ ...pendingRevision }], [{ id: 11, estimatedHours: "26.00" }]);

    const response = await request(app)
      .patch("/mfh/knowledge-base/7/production-reviews/21/approve")
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/changed/i);
    expect(h.updatePayloads).toHaveLength(0);
  });
});