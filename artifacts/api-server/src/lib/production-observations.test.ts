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
});