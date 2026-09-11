// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  observations: {
    isLoading: false,
    isError: false,
    data: undefined as any,
    refetch: vi.fn(),
  },
  reviews: { data: [] as any[] },
  componentReviews: { data: [] as any[] },
  toast: vi.fn(),
  activeBusiness: null as { id: number; name: string } | null,
}));

vi.mock("@workspace/api-client-react", () => ({
  useMfhProductionObservations: () => h.observations,
  useMfhProductionBenchmarkReviews: () => h.reviews,
  useMfhComponentBaselineReviews: () => h.componentReviews,
  useCreateMfhProductionBenchmarkReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveMfhProductionBenchmarkReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectMfhProductionBenchmarkReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateMfhComponentBaselineReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveMfhComponentBaselineReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectMfhComponentBaselineReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/contexts/BusinessContext", () => ({
  useBusiness: () => ({ activeBusiness: h.activeBusiness }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}));

const { ProductionObservationCard } = await import("./MfhKnowledgeBase");

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  h.observations = { isLoading: false, isError: false, data: undefined, refetch: vi.fn() };
  h.reviews = { data: [] };
  h.componentReviews = { data: [] };
  h.toast.mockReset();
  h.activeBusiness = null;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function renderCard() {
  await act(async () => {
    root.render(<ProductionObservationCard modelId={7} />);
  });
}

function text() {
  return host.textContent ?? "";
}

function button(label: string) {
  const match = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(label));
  if (!match) throw new Error(`Button not found: ${label}`);
  return match as HTMLButtonElement;
}

const populated = {
  modelId: 7,
  benchmark: { id: 11, jobType: "MFH Trim-Out", estimatedHours: 24 },
  sample: {
    eligibleJobCount: 3,
    minimumJobsRequired: 3,
    sufficient: true,
    lastObservedDate: "2026-09-10",
  },
  observed: {
    productionDaysMedian: 2,
    productionDaysRange: { min: 1, max: 3 },
    calendarSpanMedian: 3,
    calendarSpanRange: { min: 2, max: 4 },
    explicitPauseDaysTotal: 1,
    serviceScopes: [{ id: 101, name: "Trim-Out", jobCount: 3 }],
  },
  jobs: [{
    id: 101,
    title: "Oak Ridge 28x76",
    status: "completed",
    productionDays: 2,
    calendarSpanDays: 3,
    explicitPauseDays: 1,
    unrecordedDays: 0,
    firstProductionDate: "2026-09-08",
    lastProductionDate: "2026-09-10",
    presence: [
      { date: "2026-09-08", state: "not_here", provenance: "confirmed", notHereReason: "weather", notes: "Rain delay" },
      { date: "2026-09-09", state: "unrecorded", provenance: "confirmed", notHereReason: null, notes: null },
      { date: "2026-09-10", state: "here", provenance: "inferred", notHereReason: null, notes: null },
    ],
    serviceScopes: [{ id: 101, name: "Trim-Out" }],
    exclusionReason: null,
  }],
};

describe("ProductionObservationCard response states", () => {
  it("renders the loading state without dereferencing the response", async () => {
    h.observations.isLoading = true;
    await renderCard();

    expect(host.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(text()).not.toContain("Observed Production History");
  });

  it("renders populated observations with the benchmark context and expandable evidence", async () => {
    h.observations.data = populated;
    await renderCard();

    expect(text()).toContain("Observed Production History");
    expect(text()).toContain("Learned production days");
    expect(text()).toContain("2.0");
    expect(text()).toContain("Existing benchmark: 24.0 hours");
    expect(text()).toContain("Scope: All businesses");
    expect(text()).not.toContain("Oak Ridge 28x76");

    await act(async () => button("Why this observation?").click());

    expect(text()).toContain("Oak Ridge 28x76");
    expect(text()).toContain("Trim-Out");
    expect(text()).toContain("1 pause");
    expect(host.querySelector('a[href="/jobs?openJob=101"]')?.getAttribute("aria-label"))
      .toBe("Open job details for Oak Ridge 28x76");
  });

  it("renders component expected-versus-actual learning without exposing labor hours", async () => {
    h.observations.data = {
      ...populated,
      observed: {
        ...populated.observed,
        componentObservations: [{
          learningKey: "interior_finish:vog",
          componentKey: "interior_finish",
          componentLabel: "Interior Finish",
          variant: "vog",
          customProfile: null,
          eligibleJobCount: 3,
          minimumJobsRequired: 3,
          sufficient: true,
          expectedProductionDaysMedian: 2,
          expectedProductionDaysRange: { min: 1, max: 3 },
          actualWorkDaysMedian: 2,
          actualWorkDaysRange: { min: 1, max: 3 },
          expectedVsActualDaysMedian: 0,
          expectedVsActualDaysRange: { min: -1, max: 1 },
          explicitPauseDaysTotal: 1,
          unrecordedDaysTotal: 2,
          jobs: [{
            jobId: 101,
            title: "Oak Ridge 28x76",
            learningKey: "interior_finish:vog",
            componentKey: "interior_finish",
            componentLabel: "Interior Finish",
            variant: "vog",
            customProfile: null,
            expectedProductionDays: 2,
            actualWorkDays: 2,
            expectedVsActualDays: 0,
            workDates: ["2026-09-09", "2026-09-10"],
            conflictDates: [],
            explicitPauseDays: 1,
            unrecordedDays: 0,
            snapshotEvidence: [{ snapshotId: 55, snapshotVersion: 2, expectedProductionDays: 2, sessionIds: [88] }],
            exclusionReason: null,
          }],
        }],
      },
    };
    await renderCard();

    expect(text()).toContain("Component production-day learning");
    expect(text()).toContain("Interior Finish · VOG");
    expect(text()).toContain("Actual − expected");
    expect(text()).not.toContain("actual hours");

    await act(async () => button("Interior Finish · VOG").click());
    expect(text()).toContain("Snapshot 55 v2");
    expect(text()).toContain("Work dates: 09/09/2026, 09/10/2026");
    expect(host.querySelector('a[href="/jobs?openJob=101"]')).not.toBeNull();
  });

  it("shows confirmed production dates in chronological order", async () => {
    h.observations.data = {
      ...populated,
      jobs: [{
        ...populated.jobs[0],
        presence: [
          { date: "2026-09-10", state: "here", provenance: "confirmed", notHereReason: null, notes: null },
          { date: "2026-09-08", state: "here", provenance: "confirmed", notHereReason: null, notes: null },
          { date: "2026-09-09", state: "here", provenance: "confirmed", notHereReason: null, notes: null },
        ],
      }],
    };
    await renderCard();
    await act(async () => button("Why this observation?").click());

    expect(host.querySelector("#mfh-evidence-job-101")?.textContent).toContain(
      "Confirmed here: 09/08/2026, 09/09/2026, 09/10/2026",
    );
  });

  it("reveals benchmark history details and jumps to linked source evidence", async () => {
    h.observations.data = populated;
    h.reviews.data = [{
      id: 55,
      benchmarkId: 11,
      mfhModelId: 7,
      priorBenchmarkHours: 24,
      proposedBenchmarkHours: 26,
      observedProductionDaysMedian: 2,
      observedProductionDaysRange: { min: 1, max: 3 },
      sampleSize: 1,
      sourceJobIds: [101],
      status: "approved",
      reviewerNote: "Confirmed after the trim-out review.",
      createdByUserId: "user_1",
      createdByName: "Willard",
      createdAt: "2026-09-11T14:00:00.000Z",
      reviewedByUserId: "user_1",
      reviewedByName: "Willard",
      reviewedAt: "2026-09-12T15:30:00.000Z",
    }];
    await renderCard();

    await act(async () => button("Approved 26.0 hours").click());
    expect(text()).toContain("Prior benchmark");
    expect(text()).toContain("24.0 hours");
    expect(text()).toContain("Proposed benchmark");
    expect(text()).toContain("26.0 hours");
    expect(text()).toContain("Confirmed after the trim-out review.");
    expect(text()).toContain("Decision:");
    expect(text()).toContain("Job #101 · Oak Ridge 28x76");
    expect(host.querySelector("#mfh-evidence-job-101")).toBeNull();

    await act(async () => button("Job #101").click());
    expect(text()).toContain("Oak Ridge 28x76");
    expect(host.querySelector("#mfh-evidence-job-101")?.className).toContain("border-amber-400");
  });

  it("explains an insufficient sample and a sample with no confirmed presence", async () => {
    h.observations.data = {
      ...populated,
      sample: { ...populated.sample, eligibleJobCount: 1, sufficient: false },
      jobs: [{ ...populated.jobs[0], exclusionReason: "no_confirmed_presence" }],
    };
    await renderCard();
    expect(text()).toContain("2 more eligible jobs with confirmed presence are needed.");

    h.observations.data = {
      ...populated,
      sample: { ...populated.sample, eligibleJobCount: 0, sufficient: false },
      jobs: [{ ...populated.jobs[0], exclusionReason: "no_confirmed_presence" }],
    };
    await renderCard();
    expect(text()).toContain("These jobs have no confirmed here record yet");
    await act(async () => button("Why this observation?").click());
    expect(text()).toContain("Daily presence must include a confirmed here record before this job can contribute.");
    expect(text()).toContain("Presence provenance");
    expect(text()).toContain("Confirmed here: None recorded");
    expect(text()).toContain("09/08/2026 — Weather · Rain delay");
    expect(text()).toContain("Unrecorded or inferred rows are not treated as here or not here.");
    expect(host.querySelector('a[href="/jobs?openJob=101"]')?.getAttribute("aria-label"))
      .toBe("Open job details for Oak Ridge 28x76");

    h.observations.data = {
      ...populated,
      jobs: [{ ...populated.jobs[0], presence: [], exclusionReason: "no_confirmed_presence" }],
    };
    await renderCard();
    expect(text()).toContain("No daily presence records were found for this job.");
    expect(text()).not.toContain("Weather");
  });

  it("renders the empty state separately from insufficient evidence", async () => {
    h.observations.data = { ...populated, jobs: [], sample: { ...populated.sample, eligibleJobCount: 0, sufficient: false } };
    await renderCard();

    expect(text()).toContain("No completed production history is available for this model.");
    expect(text()).not.toContain("Not enough history to show a learned baseline.");
  });

  it("retries only the observation query from the error state", async () => {
    h.observations.isError = true;
    await renderCard();

    expect(text()).toContain("Production history unavailable");
    await act(async () => button("Retry").click());
    expect(h.observations.refetch).toHaveBeenCalledTimes(1);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("keeps business-scoped history read-only and does not show global review controls", async () => {
    h.activeBusiness = { id: 42, name: "Asphalt Sealing" };
    h.observations.data = populated;
    await renderCard();

    expect(text()).toContain("Scope: Asphalt Sealing");
    expect(text()).toContain("Benchmark review is available from the all-business view only");
    expect(text()).not.toContain("Review baseline");
  });
});