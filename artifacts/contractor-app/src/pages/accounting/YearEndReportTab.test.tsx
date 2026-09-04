// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YearEndReportTab from "./YearEndReportTab";

const queryHarness = vi.hoisted(() => ({
  report: null as any,
  tripsError: false,
  tripsRefetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey?: unknown[] }) => {
    const isTripQuery = queryKey?.[0] === "biz-trips-report";
    return {
      data: isTripQuery ? [] : queryHarness.report,
      isLoading: false,
      isFetching: false,
      isError: isTripQuery && queryHarness.tripsError,
      error: null,
      refetch: isTripQuery ? queryHarness.tripsRefetch : vi.fn(),
    };
  },
}));

vi.mock("@/contexts/BusinessContext", () => ({
  useBusiness: () => ({ activeBusiness: null }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const reportFixture = {
  year: 2026,
  generatedAt: "2026-09-03T00:00:00.000Z",
  companyName: "BuildPro Test Company",
  summary: {
    grossReceipts: 1000,
    otherIncomeTotal: 0,
    totalRevenue: 1000,
    totalExpenses: 200,
    mileageDeduction: 76,
    mileageRate: 0.76,
    mileageRatePeriods: [],
    totalMiles: 100,
    totalDepreciation: 0,
    netProfit: 800,
  },
  taxEstimates: {
    selfEmploymentTax: 100,
    federalIncomeTax: 100,
    kyStateTax: 20,
    owensboroOccTax: 0,
    totalLiability: 220,
    totalPaid: 0,
    balance: 220,
  },
  expensesBySchedC: [],
  totalExpenses: 200,
  invoices: [],
  otherIncome: [],
  mileage: { totalMiles: 100, mileageRate: 0.76, deduction: 76, trips: 2, ratePeriods: [] },
  depreciation: { rows: [], total: 0, totalAccumulated: 0 },
  disposedAssets: [],
  sub1099s: [{
    id: 1,
    name: "A Very Long Subcontractor Name That Must Wrap",
    ytdPayments: 1250,
    requires1099: true,
    w9OnFile: false,
    w9LegalName: "A Very Long Legal Name That Must Wrap On Mobile",
  }],
  estimatedTaxPayments: [],
};

describe("Year-End 1099 mobile presentation", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryHarness.report = reportFixture;
    act(() => {
      root.render(<YearEndReportTab year={2026} />);
    });
  });

  it("keeps names, payment totals, and status readable in the mobile card variant", () => {
    const mobileCards = container.querySelector(".md\\:hidden");
    const desktopTable = container.querySelector(".hidden.md\\:block table");

    expect(mobileCards).not.toBeNull();
    expect(mobileCards?.textContent).toContain("A Very Long Subcontractor Name That Must Wrap");
    expect(mobileCards?.textContent).toContain("$1,250.00");
    expect(mobileCards?.textContent).toContain("1099 Required");
    expect(mobileCards?.textContent).toContain("W-9 missing");
    expect(desktopTable).not.toBeNull();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    queryHarness.report = null;
  });
});

describe("Year-End Business Trips request state", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryHarness.report = reportFixture;
    queryHarness.tripsError = true;
    queryHarness.tripsRefetch.mockReset();
    act(() => {
      root.render(<YearEndReportTab year={2026} />);
    });
  });

  it("labels failed trip totals as unavailable and retries the read query", () => {
    const summary = container.querySelector('[data-testid="status-year-end-trips-summary"]');
    expect(summary?.textContent).toBe("Trips unavailable");
    expect(summary?.textContent).not.toContain("0 trips");

    const sectionToggle = Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent?.includes("Business Trip Summary"));
    act(() => sectionToggle?.click());

    const errorState = container.querySelector('[data-testid="status-year-end-trips-error"]');
    expect(errorState?.textContent).toContain("Travel totals are unavailable, not zero");

    const retry = container.querySelector('[data-testid="button-retry-year-end-trips"]') as HTMLButtonElement;
    act(() => retry.click());
    expect(queryHarness.tripsRefetch).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    queryHarness.report = null;
    queryHarness.tripsError = false;
  });
});