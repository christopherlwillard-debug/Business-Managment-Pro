// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RevenueByMonthTab from "./RevenueByMonthTab";

const report = {
  year: 2026,
  businessLine: null,
  annualTotal: 1625,
  monthlyAverage: 1625 / 12,
  months: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    invoiceRevenue: index === 1 ? 1200 : index === 2 ? 300 : 0,
    otherIncome: index === 1 ? 125 : 0,
    totalRevenue: index === 1 ? 1325 : index === 2 ? 300 : 0,
  })),
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: report,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("Revenue by Month report", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<RevenueByMonthTab year={2026} />);
    });
  });

  it("shows all 12 months, the annual total, and the revenue-source breakdown", () => {
    expect(container.querySelectorAll('[data-testid^="row-monthly-revenue-"]')).toHaveLength(12);
    expect(container.querySelector('[data-testid="value-annual-revenue"]')?.textContent).toBe("$1,625.00");
    expect(container.textContent).toContain("Paid Invoices");
    expect(container.textContent).toContain("Other Income");
    expect(container.textContent).toContain("February");
    expect(container.textContent).toContain("$1,325.00");
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
});