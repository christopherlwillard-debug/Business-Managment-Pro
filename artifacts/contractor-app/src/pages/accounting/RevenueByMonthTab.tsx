import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BarChart3, RefreshCw, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MonthlyRevenueRow {
  month: string;
  invoiceRevenue: number;
  otherIncome: number;
  totalRevenue: number;
}

interface RevenueByMonthReport {
  year: number;
  businessLine: string | null;
  annualTotal: number;
  monthlyAverage: number;
  months: MonthlyRevenueRow[];
}

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function monthLabel(month: string, compact = false) {
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return new Intl.DateTimeFormat("en-US", { month: compact ? "short" : "long" })
    .format(new Date(2026, monthIndex, 1));
}

async function fetchRevenueByMonth(year: number, businessLine?: string) {
  const params = new URLSearchParams({ year: String(year) });
  if (businessLine) params.set("businessLine", businessLine);
  const response = await fetch(`${BASE}/api/reports/revenue-by-month?${params}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to load monthly revenue");
  return response.json() as Promise<RevenueByMonthReport>;
}

export default function RevenueByMonthTab({
  year,
  businessLine,
}: {
  year: number;
  businessLine?: string;
}) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["revenue-by-month", year, businessLine ?? "all"],
    queryFn: () => fetchRevenueByMonth(year, businessLine),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="py-24 text-center text-sm text-muted-foreground animate-pulse">
        Loading monthly revenue…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/70 px-5 py-10 text-center" role="alert">
        <AlertCircle className="w-9 h-9 text-red-500 mx-auto mb-3" />
        <p className="font-semibold text-red-800">Monthly revenue could not be loaded</p>
        <p className="text-sm text-red-700 mt-1">No totals are shown until the report loads successfully.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 mt-4 px-3 py-2 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          data-testid="button-retry-monthly-revenue"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  const strongestMonth = data.months.reduce<MonthlyRevenueRow | null>(
    (best, row) => !best || row.totalRevenue > best.totalRevenue ? row : best,
    null,
  );
  const chartData = data.months.map(row => ({
    ...row,
    label: monthLabel(row.month, true),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Revenue by Month — {year}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paid invoices are counted in their first verified delivery month. Other income is counted by receipt date.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/60 bg-card px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year Total</p>
          <p className="text-2xl font-bold text-foreground mt-1" data-testid="value-annual-revenue">
            {money(data.annualTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monthly Average</p>
          <p className="text-2xl font-bold text-foreground mt-1">{money(data.monthlyAverage)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highest Month</p>
          <p className="text-lg font-bold text-foreground mt-1">
            {strongestMonth && strongestMonth.totalRevenue > 0 ? monthLabel(strongestMonth.month) : "No revenue yet"}
          </p>
          {strongestMonth && strongestMonth.totalRevenue > 0 && (
            <p className="text-sm text-emerald-600 font-semibold">{money(strongestMonth.totalRevenue)}</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">12-Month Overview</h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value: number) => value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.month ? monthLabel(payload[0].payload.month) : ""}
                formatter={(value: number) => [money(value), "Revenue"]}
              />
              <Bar dataKey="totalRevenue" name="Revenue" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Monthly Detail</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs text-muted-foreground">
                <th className="text-left font-semibold px-5 py-3">Month</th>
                <th className="text-right font-semibold px-5 py-3">Paid Invoices</th>
                <th className="text-right font-semibold px-5 py-3">Other Income</th>
                <th className="text-right font-semibold px-5 py-3">Total Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map(row => (
                <tr key={row.month} className="border-t border-border/40" data-testid={`row-monthly-revenue-${row.month}`}>
                  <td className="px-5 py-3 font-medium text-foreground">{monthLabel(row.month)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{money(row.invoiceRevenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{money(row.otherIncome)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-foreground">{money(row.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20 font-bold">
                <td className="px-5 py-3">Year Total</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {money(data.months.reduce((sum, row) => sum + row.invoiceRevenue, 0))}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {money(data.months.reduce((sum, row) => sum + row.otherIncome, 0))}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{money(data.annualTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}