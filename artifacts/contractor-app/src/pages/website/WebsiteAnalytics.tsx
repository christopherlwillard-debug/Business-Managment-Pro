import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Eye, Calendar, TrendingUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AnalyticsData {
  total: number;
  last7days: number;
  last30days: number;
  daily: Array<{ date: string; views: number }>;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-3xl font-bold text-foreground tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WebsiteAnalytics({ businessId }: { businessId: number }) {
  const { data, isLoading, isError } = useQuery<AnalyticsData>({
    queryKey: ["website-analytics", businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/analytics?businessId=${businessId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Failed to load analytics.
      </div>
    );
  }

  const chartData = data.daily.map((row, i) => ({
    ...row,
    label: i % 4 === 0 ? formatDate(row.date) : "",
    fullLabel: formatDate(row.date),
  }));

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold text-foreground">Site Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Page views tracked server-side — no cookies, no external services.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatCard label="All-Time Visits" value={data.total} icon={Eye} />
          <StatCard label="Last 7 Days"     value={data.last7days}  icon={Calendar} />
          <StatCard label="Last 30 Days"    value={data.last30days} icon={TrendingUp} />
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Daily Visits — Last 28 Days</p>
          {data.total === 0 ? (
            <div className="flex flex-col items-center justify-center h-44 text-muted-foreground text-sm gap-2">
              <Eye className="w-10 h-10 opacity-20" />
              <p className="font-medium">No visits recorded yet</p>
              <p className="text-xs text-center max-w-xs">
                Visits will appear here once your site is published and people start viewing it.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload as { fullLabel: string; views: number };
                    return (
                      <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
                        <p className="font-semibold text-foreground">{item.fullLabel}</p>
                        <p className="text-muted-foreground">
                          {item.views} {item.views === 1 ? "visit" : "visits"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="views" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
