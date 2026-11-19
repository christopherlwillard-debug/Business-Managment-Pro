// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessSelector from "../BusinessSelector";
import ProfitLossTab from "./ProfitLossTab";

const contextHarness = vi.hoisted(() => ({
  activeBusiness: null as any,
  businesses: [] as any[],
  setActiveBusiness: vi.fn(),
}));

const queryHarness = vi.hoisted(() => ({
  mainQueries: [] as any[],
  divisionQueries: [] as any[],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: any) => {
    queryHarness.mainQueries.push(options);
    return { data: reportFixture, isLoading: false, error: null };
  },
  useQueries: ({ queries }: { queries: any[] }) => {
    queryHarness.divisionQueries = queries;
    return queries.map(() => ({ data: reportFixture, isLoading: false, isError: false }));
  },
}));

vi.mock("@/contexts/BusinessContext", () => ({
  useBusiness: () => contextHarness,
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetDashboardStats: () => ({ data: null, isLoading: false }),
}));

const rootBusiness = {
  id: 1,
  name: "General Contracting",
  slug: "general_contracting",
  type: "general_contracting",
  legalBusinessId: 1,
  isActive: true,
  logoUrl: null,
};

const inactiveDivision = {
  id: 2,
  name: "Asphalt Sealing",
  slug: "asphalt_sealing",
  type: "asphalt_sealing",
  legalBusinessId: 1,
  isActive: false,
  logoUrl: null,
};

const reportFixture = {
  year: 2026,
  revenue: { grossReceipts: 1000, otherIncome: 0, grossRevenue: 1000 },
  cogs: { materials: 0, total: 0 },
  grossProfit: 1000,
  operatingExpenses: [],
  totalOperatingExpenses: 0,
  netOperatingIncome: 1000,
  deductions: {
    mileageDeduction: 0,
    totalMiles: 0,
    mileageRate: null,
    depreciationDeduction: 0,
  },
  netProfit: 1000,
};

function AccountingReportTestPage() {
  const [activeBusiness, setActiveBusiness] = useState<any>(rootBusiness);
  contextHarness.activeBusiness = activeBusiness;

  return (
    <>
      <BusinessSelector onSelect={setActiveBusiness} />
      <ProfitLossTab year={2026} />
    </>
  );
}

describe("inactive divisions remain selectable for Accounting reports", () => {
  let root: Root;
  let container: HTMLDivElement;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    contextHarness.activeBusiness = rootBusiness;
    contextHarness.businesses = [rootBusiness];
    contextHarness.setActiveBusiness.mockReset();
    queryHarness.mainQueries = [];
    queryHarness.divisionQueries = [];
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => reportFixture,
    });
    vi.stubGlobal("fetch", fetchMock);

    act(() => root.render(<AccountingReportTestPage />));
  });

  it("keeps the inactive division after business data reload and requests its history when selected", async () => {
    // Simulate BusinessContext receiving refreshed data from /api/businesses.
    act(() => {
      contextHarness.businesses = [rootBusiness, inactiveDivision];
      root.render(<AccountingReportTestPage />);
    });

    expect(container.textContent).toContain("Asphalt Sealing");
    expect(container.textContent).toContain("Inactive · history retained");

    const inactiveComparison = queryHarness.divisionQueries.find(query =>
      query.queryKey?.[2] === inactiveDivision.slug,
    );
    expect(inactiveComparison).toBeDefined();

    await act(async () => {
      await inactiveComparison.queryFn();
    });
    let requestUrl = new URL(fetchMock.mock.calls.at(-1)?.[0], "http://localhost");
    expect(requestUrl.pathname).toContain("/api/reports/profit-loss");
    expect(requestUrl.searchParams.get("businessId")).toBe(String(rootBusiness.id));
    expect(requestUrl.searchParams.get("businessLine")).toBe(inactiveDivision.slug);

    const selectInactiveDivision = container.querySelector(
      `[data-testid="business-select-${inactiveDivision.id}"]`,
    ) as HTMLButtonElement | null;
    expect(selectInactiveDivision).not.toBeNull();
    act(() => selectInactiveDivision!.click());
    expect(contextHarness.setActiveBusiness).toHaveBeenCalledWith(inactiveDivision);

    const selectedDivisionQuery = queryHarness.mainQueries.at(-1);
    expect(selectedDivisionQuery.queryKey).toEqual([
      "profit-loss",
      2026,
      inactiveDivision.slug,
      null,
    ]);
    await act(async () => {
      await selectedDivisionQuery.queryFn();
    });

    requestUrl = new URL(fetchMock.mock.calls.at(-1)?.[0], "http://localhost");
    expect(requestUrl.pathname).toContain("/api/reports/profit-loss");
    expect(requestUrl.searchParams.get("businessLine")).toBe(inactiveDivision.slug);
    expect(requestUrl.searchParams.has("businessId")).toBe(false);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
