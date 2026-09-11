import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { buildProductionObservationResponse } from "../lib/production-observations";
import { buildComponentBaselineEvidence } from "../lib/component-baselines";

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
        execute: () => Promise.resolve([]),
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

function componentBaselineFixture() {
  const observationJobs = Array.from({ length: 5 }, (_, index) => {
    const id = index + 1;
    return {
      ...jobs[0],
      id,
      title: `Component production job ${id}`,
      businessId: 1,
      mhProductionServices: [101],
      serviceScopes: [{ id: 101, name: "Interior Finish" }],
      presence: [{
        date: `2026-09-0${id}`,
        state: "here" as const,
        provenance: "confirmed",
        notHereReason: null,
        notes: null,
      }],
      components: [{
        id: 500 + id,
        jobId: id,
        componentKey: "interior_finish",
        componentInstanceKey: "interior_finish:vog",
        componentLabel: "Interior Finish",
        variant: "vog",
        snapshotVersion: 2,
        status: "completed",
        expectedDurationDays: 2,
        knowledgeContext: null,
      }],
      workSessions: [{
        id: 700 + id,
        jobId: id,
        productionComponentId: 500 + id,
        workDate: `2026-09-0${id}`,
      }],
    };
  });
  const summary = buildProductionObservationResponse(
    7,
    observationJobs,
    { id: 11, jobType: "MFH Trim-Out", estimatedHours: 24 },
  );
  const evidence = buildComponentBaselineEvidence(summary, 1, "interior_finish:vog");
  if (!evidence) throw new Error("fixture did not produce component evidence");
  const revision = {
    id: 31,
    businessId: 1,
    mfhModelId: 7,
    learningKey: "interior_finish:vog",
    componentKey: "interior_finish",
    componentLabel: "Interior Finish",
    variant: "vog",
    customProfile: null,
    priorApprovedRevisionId: null,
    priorApprovedProductionDays: null,
    proposedProductionDays: "1.00",
    observedActualProductionDaysMedian: "1.00",
    observedActualProductionDaysMin: "1.00",
    observedActualProductionDaysMax: "1.00",
    observedExpectedProductionDaysMedian: "2.00",
    observedExpectedProductionDaysMin: "2.00",
    observedExpectedProductionDaysMax: "2.00",
    sampleSize: 5,
    sourceJobIds: evidence.sourceJobIds,
    sourceEvidence: evidence.evidence,
    sourceEvidenceHash: evidence.sourceEvidenceHash,
    status: "pending",
    reviewerNote: null,
    createdByUserId: "user_1",
    createdByName: "Test Reviewer",
    createdAt: new Date("2026-09-10T12:00:00Z"),
    reviewedByUserId: null,
    reviewedByName: null,
    reviewedAt: null,
    supersededByUserId: null,
    supersededByName: null,
    supersededAt: null,
  };
  return { observationJobs, evidence, revision };
}

function queueComponentObservation(fixture: ReturnType<typeof componentBaselineFixture>) {
  const { observationJobs } = fixture;
  h.selectQueue.push(
    [model],
    observationJobs.map(({ presence: _presence, components: _components, workSessions: _sessions, ...job }) => job),
    [{ id: 101, name: "Interior Finish", itemKey: "interior_finish", appliesTo: "production", businessId: null }],
    [],
    observationJobs.flatMap((job) => job.presence.map((row) => ({ jobId: job.id, ...row }))),
    observationJobs.flatMap((job) => job.components),
    observationJobs.flatMap((job) => job.workSessions),
  );
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

  it("requires a concrete business scope for component baseline review history", async () => {
    const response = await request(app)
      .get("/mfh/knowledge-base/7/component-baseline-reviews");

    expect(response.status).toBe(400);
    expect(h.consumedSlots).toBe(0);
  });

  it("creates a component baseline review only after five eligible jobs", async () => {
    h.scope = { id: 1, slug: "general_contracting" };
    const fixture = componentBaselineFixture();
    queueComponentObservation(fixture);
    h.selectQueue.push([]);
    h.insertResult = [fixture.revision];

    const response = await request(app)
      .post("/mfh/knowledge-base/7/component-baseline-reviews")
      .query({ businessId: 1 })
      .send({
        learningKey: "interior_finish:vog",
        proposedProductionDays: 1,
        reviewerNote: "Stable five-job sample.",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      businessId: 1,
      learningKey: "interior_finish:vog",
      sampleSize: 5,
      sourceJobIds: [1, 2, 3, 4, 5],
      status: "pending",
    });
    expect(response.body.sourceEvidence.jobs[0].snapshotEvidence[0]).toMatchObject({
      snapshotId: 501,
      snapshotVersion: 2,
    });
  });

  it("rejects a component baseline without changing any active baseline", async () => {
    h.scope = { id: 1, slug: "general_contracting" };
    const fixture = componentBaselineFixture();
    h.selectQueue.push([{ ...fixture.revision }]);
    h.updateResults = [[{ ...fixture.revision, status: "rejected", reviewerNote: "Needs another review." }]];

    const response = await request(app)
      .patch("/mfh/knowledge-base/7/component-baseline-reviews/31/reject")
      .query({ businessId: 1 })
      .send({ reviewerNote: "Needs another review." });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("rejected");
    expect(h.updatePayloads).toEqual([
      expect.objectContaining({ status: "rejected", reviewerNote: "Needs another review." }),
    ]);
  });

  it("blocks component approval when source evidence is stale", async () => {
    h.scope = { id: 1, slug: "general_contracting" };
    const fixture = componentBaselineFixture();
    const staleRevision = { ...fixture.revision, sourceEvidenceHash: "stale-hash" };
    h.selectQueue.push([{ id: 31, learningKey: staleRevision.learningKey }], [staleRevision]);
    queueComponentObservation(fixture);

    const response = await request(app)
      .patch("/mfh/knowledge-base/7/component-baseline-reviews/31/approve")
      .query({ businessId: 1 })
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/source evidence changed/i);
    expect(h.updatePayloads).toHaveLength(0);
  });

  it("supersedes the prior approved component baseline during approval", async () => {
    h.scope = { id: 1, slug: "general_contracting" };
    const fixture = componentBaselineFixture();
    const revision = {
      ...fixture.revision,
      priorApprovedRevisionId: 30,
      priorApprovedProductionDays: "1.50",
    };
    h.selectQueue.push([{ id: 31, learningKey: revision.learningKey }], [revision]);
    queueComponentObservation(fixture);
    h.selectQueue.push([{ id: 30, proposedProductionDays: "1.50" }]);
    h.updateResults = [
      [],
      [{ ...revision, status: "approved", reviewedByName: "Test Reviewer" }],
    ];

    const response = await request(app)
      .patch("/mfh/knowledge-base/7/component-baseline-reviews/31/approve")
      .query({ businessId: 1 })
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("approved");
    expect(h.updatePayloads).toEqual([
      expect.objectContaining({ status: "superseded", supersededByUserId: "user_1" }),
      expect.objectContaining({ status: "approved", reviewedByUserId: "user_1" }),
    ]);
  });
});