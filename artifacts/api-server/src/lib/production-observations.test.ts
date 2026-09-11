import { describe, expect, it } from "vitest";
import {
  buildProductionObservationResponse,
  calculateProductionObservation,
  median,
} from "./production-observations";

const service = (name = "Interior Finish", id = 1) => [{ id, name }];

describe("production observations", () => {
  it("counts only confirmed here days and keeps pauses separate from missing evidence", () => {
    expect(calculateProductionObservation([
      { date: "2026-09-01", state: "here", provenance: "confirmed", notHereReason: null, notes: null },
      { date: "2026-09-02", state: "not_here", provenance: "confirmed", notHereReason: "weather", notes: "Rain delay" },
      { date: "2026-09-03", state: "unrecorded", provenance: "confirmed", notHereReason: null, notes: null },
      { date: "2026-09-04", state: "here", provenance: "confirmed", notHereReason: null, notes: null },
      { date: "2026-09-05", state: "here", provenance: "inferred", notHereReason: "other", notes: "Ignored because inferred" },
    ])).toEqual({
      firstProductionDate: "2026-09-01",
      lastProductionDate: "2026-09-04",
      calendarSpanDays: 4,
      productionDays: 2,
      explicitPauseDays: 1,
      unrecordedDays: 1,
    });
  });

  it("returns no observation when there is no confirmed here evidence", () => {
    expect(calculateProductionObservation([
      { date: "2026-09-01", state: "here", provenance: "inferred", notHereReason: null, notes: null },
      { date: "2026-09-02", state: "not_here", provenance: "confirmed", notHereReason: "weather", notes: null },
    ])).toBeNull();
  });

  it("returns no observation when a job has no presence rows", () => {
    expect(calculateProductionObservation([])).toBeNull();

    const response = buildProductionObservationResponse(
      22,
      [{
        id: 10,
        title: "No Presence",
        status: "completed",
        workflow: "mh_production",
        serviceScopes: service(),
        presence: [],
      }],
      { id: null, jobType: null, estimatedHours: null },
    );

    expect(response.jobs[0]).toMatchObject({
      presence: [],
      productionDays: null,
      exclusionReason: "no_confirmed_presence",
    });
  });

  it("uses the average of the middle pair for an even median", () => {
    expect(median([1, 4, 2, 8])).toBe(3);
  });

  it("keeps an insufficient sample traceable without publishing learned aggregates", () => {
    const response = buildProductionObservationResponse(
      22,
      [
        { id: 1, title: "One", status: "completed", workflow: "mh_production", serviceScopes: service(), presence: [{ date: "2026-09-01", state: "here", provenance: "confirmed", notHereReason: null, notes: null }] },
        { id: 2, title: "Two", status: "invoiced", workflow: "mh_production", serviceScopes: service(), presence: [{ date: "2026-09-01", state: "here", provenance: "confirmed", notHereReason: null, notes: null }] },
        { id: 3, title: "Waiting", status: "completed", workflow: "mh_production", serviceScopes: service("Siding", 2), presence: [{ date: "2026-09-01", state: "here", provenance: "inferred", notHereReason: null, notes: null }] },
      ],
      { id: 4, jobType: "Clayton", estimatedHours: 16 },
    );

    expect(response.modelId).toBe(22);
    expect(response.sample).toMatchObject({
      eligibleJobCount: 2,
      minimumJobsRequired: 3,
      sufficient: false,
      lastObservedDate: "2026-09-01",
    });
    expect(response.observed.productionDaysMedian).toBeNull();
    expect(response.observed.calendarSpanRange).toBeNull();
    expect(response.jobs[2].exclusionReason).toBe("no_confirmed_presence");
  });

  it("aggregates medians, ranges, service scopes, and pause totals after three jobs", () => {
    const response = buildProductionObservationResponse(
      22,
      [1, 2, 4].map((days, index) => ({
        id: index + 1,
        title: `Job ${index + 1}`,
        status: "completed",
        workflow: "mh_production",
        serviceScopes: service(index === 2 ? "Siding" : "Interior Finish", index === 2 ? 2 : 1),
        presence: Array.from({ length: days }, (_, day) => ({
          date: `2026-09-0${day + 1}`,
          state: "here" as const,
          provenance: "confirmed",
          notHereReason: null,
          notes: null,
        })),
      })),
      { id: null, jobType: null, estimatedHours: null },
    );

    expect(response.sample.sufficient).toBe(true);
    expect(response.observed.productionDaysMedian).toBe(2);
    expect(response.observed.productionDaysRange).toEqual({ min: 1, max: 4 });
    expect(response.observed.calendarSpanMedian).toBe(2);
    expect(response.observed.serviceScopes).toEqual([
      { id: 1, name: "Interior Finish", jobCount: 2 },
      { id: 2, name: "Siding", jobCount: 1 },
    ]);
  });

  it("preserves presence facts for an excluded job without inferring absence", () => {
    const response = buildProductionObservationResponse(
      22,
      [{
        id: 9,
        title: "Excluded",
        status: "completed",
        workflow: "mh_production",
        serviceScopes: service(),
        presence: [
          { date: "2026-09-01", state: "not_here", provenance: "confirmed", notHereReason: "customer_delay", notes: "Customer requested a later start" },
          { date: "2026-09-02", state: "unrecorded", provenance: "confirmed", notHereReason: null, notes: null },
          { date: "2026-09-03", state: "here", provenance: "inferred", notHereReason: "weather", notes: "Ignored because inferred" },
        ],
      }],
      { id: null, jobType: null, estimatedHours: null },
    );

    expect(response.jobs[0]).toMatchObject({
      exclusionReason: "no_confirmed_presence",
      presence: [
        { date: "2026-09-01", state: "not_here", provenance: "confirmed", notHereReason: "customer_delay", notes: "Customer requested a later start" },
        { date: "2026-09-02", state: "unrecorded", provenance: "confirmed", notHereReason: null, notes: null },
        { date: "2026-09-03", state: "here", provenance: "inferred", notHereReason: "weather", notes: "Ignored because inferred" },
      ],
    });
    expect(response.jobs[0].productionDays).toBeNull();
  });

  it("returns unordered presence facts chronologically without losing provenance metadata", () => {
    const response = buildProductionObservationResponse(
      23,
      [{
        id: 11,
        title: "Out-of-order presence",
        status: "completed",
        workflow: "mh_production",
        serviceScopes: service(),
        presence: [
          { date: "2026-09-03", state: "here", provenance: "inferred", notHereReason: null, notes: "Schedule-derived presence" },
          { date: "2026-09-01", state: "not_here", provenance: "confirmed", notHereReason: "weather", notes: "Rain before mobilization" },
          { date: "2026-09-02", state: "unrecorded", provenance: "confirmed", notHereReason: null, notes: "No daily entry" },
        ],
      }],
      { id: null, jobType: null, estimatedHours: null },
    );

    expect(response.jobs[0].presence).toEqual([
      { date: "2026-09-01", state: "not_here", provenance: "confirmed", notHereReason: "weather", notes: "Rain before mobilization" },
      { date: "2026-09-02", state: "unrecorded", provenance: "confirmed", notHereReason: null, notes: "No daily entry" },
      { date: "2026-09-03", state: "here", provenance: "inferred", notHereReason: null, notes: "Schedule-derived presence" },
    ]);
  });

  it("selects the strongest same-day provenance and the latest equal-strength correction", () => {
    const response = buildProductionObservationResponse(
      23,
      [{
        id: 10,
        title: "Corrected same-day presence",
        status: "completed",
        workflow: "mh_production",
        serviceScopes: service(),
        presence: [
          { date: "2026-09-02", state: "here", provenance: "inferred", notHereReason: null, notes: "Inferred schedule presence" },
          { date: "2026-09-01", state: "not_here", provenance: "confirmed", notHereReason: "weather", notes: "Initial weather note" },
          { date: "2026-09-02", state: "not_here", provenance: "confirmed", notHereReason: "customer_delay", notes: "Confirmed customer correction" },
          { date: "2026-09-01", state: "not_here", provenance: "confirmed", notHereReason: "material_delay", notes: "Latest confirmed correction" },
          { date: "2026-09-03", state: "here", provenance: "confirmed", notHereReason: null, notes: null },
        ],
      }],
      { id: null, jobType: null, estimatedHours: null },
    );

    expect(response.jobs[0]).toMatchObject({
      exclusionReason: null,
      presence: [
        { date: "2026-09-01", state: "not_here", provenance: "confirmed", notHereReason: "material_delay", notes: "Latest confirmed correction" },
        { date: "2026-09-02", state: "not_here", provenance: "confirmed", notHereReason: "customer_delay", notes: "Confirmed customer correction" },
        { date: "2026-09-03", state: "here", provenance: "confirmed" },
      ],
      productionDays: 1,
      explicitPauseDays: 0,
    });
  });

  it("learns component days from exact snapshots and keeps pause conflicts separate", () => {
    const response = buildProductionObservationResponse(
      22,
      [1, 2, 3].map((id) => ({
        id,
        title: `Component job ${id}`,
        status: "completed",
        workflow: "mh_production",
        serviceScopes: service(),
        presence: [
          { date: "2026-09-01", state: "here" as const, provenance: "confirmed", notHereReason: null, notes: null },
          { date: "2026-09-02", state: "not_here" as const, provenance: "confirmed", notHereReason: "weather", notes: null },
          { date: "2026-09-03", state: "here" as const, provenance: "confirmed", notHereReason: null, notes: null },
        ],
        components: [{
          id: id * 10,
          jobId: id,
          componentKey: "interior_finish",
          componentInstanceKey: "interior_finish:vog",
          componentLabel: "Interior Finish",
          variant: "vog",
          snapshotVersion: 1,
          status: "completed",
          expectedDurationDays: 2,
          knowledgeContext: null,
        }],
        workSessions: [
          { id: id * 100, jobId: id, productionComponentId: id * 10, workDate: "2026-09-01" },
          { id: id * 100 + 1, jobId: id, productionComponentId: id * 10, workDate: "2026-09-01" },
          { id: id * 100 + 2, jobId: id, productionComponentId: id * 10, workDate: "2026-09-02" },
          { id: id * 100 + 3, jobId: id, productionComponentId: id * 10, workDate: "2026-09-03" },
        ],
      })),
      { id: null, jobType: null, estimatedHours: null },
    );

    const component = response.observed.componentObservations[0];
    expect(component.learningKey).toBe("interior_finish:vog");
    expect(component.eligibleJobCount).toBe(3);
    expect(component.sufficient).toBe(true);
    expect(component.expectedProductionDaysMedian).toBe(2);
    expect(component.actualWorkDaysMedian).toBe(2);
    expect(component.expectedVsActualDaysMedian).toBe(0);
    expect(component.jobs[0]).toMatchObject({
      actualWorkDays: 2,
      workDates: ["2026-09-01", "2026-09-03"],
      conflictDates: ["2026-09-02"],
      exclusionReason: null,
    });
  });

  it("does not reinterpret Custom snapshots without an immutable profile identity", () => {
    const response = buildProductionObservationResponse(
      22,
      [{
        id: 1,
        title: "Unmapped custom job",
        status: "invoiced",
        workflow: "mh_production",
        serviceScopes: [{ id: 99, name: "Custom work" }],
        presence: [{ date: "2026-09-01", state: "here", provenance: "confirmed", notHereReason: null, notes: null }],
        components: [{
          id: 10,
          jobId: 1,
          componentKey: "custom",
          componentInstanceKey: "custom:99",
          componentLabel: "Custom",
          variant: null,
          snapshotVersion: 2,
          status: "completed",
          expectedDurationDays: 1,
          knowledgeContext: null,
        }],
        workSessions: [{ id: 100, jobId: 1, productionComponentId: 10, workDate: "2026-09-01" }],
      }],
      { id: null, jobType: null, estimatedHours: null },
    );

    expect(response.observed.componentObservations[0]).toMatchObject({
      learningKey: "custom:unresolved:custom:99",
      eligibleJobCount: 0,
      sufficient: false,
    });
    expect(response.observed.componentObservations[0].jobs[0].exclusionReason).toBe("missing_custom_profile_snapshot");
  });

  it("uses one job observation when historical snapshots overlap and rejects expectation conflicts", () => {
    const response = buildProductionObservationResponse(
      22,
      [{
        id: 1,
        title: "Versioned component job",
        status: "completed",
        workflow: "mh_production",
        serviceScopes: service(),
        presence: [{ date: "2026-09-01", state: "here", provenance: "confirmed", notHereReason: null, notes: null }],
        components: [
          {
            id: 10,
            jobId: 1,
            componentKey: "siding",
            componentInstanceKey: "siding:unspecified",
            componentLabel: "Siding",
            variant: null,
            snapshotVersion: 1,
            status: "completed",
            expectedDurationDays: 1,
            knowledgeContext: null,
          },
          {
            id: 11,
            jobId: 1,
            componentKey: "siding",
            componentInstanceKey: "siding:unspecified",
            componentLabel: "Siding",
            variant: null,
            snapshotVersion: 2,
            status: "completed",
            expectedDurationDays: 2,
            knowledgeContext: null,
          },
        ],
        workSessions: [
          { id: 100, jobId: 1, productionComponentId: 10, workDate: "2026-09-01" },
          { id: 101, jobId: 1, productionComponentId: 11, workDate: "2026-09-01" },
        ],
      }],
      { id: null, jobType: null, estimatedHours: null },
    );

    const component = response.observed.componentObservations[0];
    expect(component.eligibleJobCount).toBe(0);
    expect(component.jobs[0]).toMatchObject({
      actualWorkDays: null,
      expectedProductionDays: null,
      exclusionReason: "conflicting_snapshot_expectations",
      workDates: ["2026-09-01"],
    });
    expect(component.jobs[0].snapshotEvidence).toHaveLength(2);
  });
});