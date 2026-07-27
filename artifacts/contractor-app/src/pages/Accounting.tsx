import React, { useState, lazy, Suspense } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useQuery } from "@tanstack/react-query";
import {
  Printer, BarChart3, TrendingUp, FileText,
  Calendar, FileSpreadsheet, BarChart2, Briefcase, PiggyBank,
} from "lucide-react";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const OverviewTab      = lazy(() => import("./accounting/OverviewTab"));
const ProfitLossTab    = lazy(() => import("./accounting/ProfitLossTab"));
const ScheduleCTab     = lazy(() => import("./accounting/ScheduleCTab"));
const TaxCalendarTab   = lazy(() => import("./accounting/TaxCalendarTab"));
const YearEndReportTab = lazy(() => import("./accounting/YearEndReportTab"));
const BenchmarksTab    = lazy(() => import("./accounting/BenchmarksTab"));
const BusinessTripsTab = lazy(() => import("./accounting/BusinessTripsTab"));
const InvestmentsTab   = lazy(() => import("./accounting/InvestmentsTab"));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAccounting(year: number, businessLine?: string) {
  const params = new URLSearchParams({ year: String(year) });
  if (businessLine) params.set("businessLine", businessLine);
  const res = await fetch(`${BASE}/api/reports/accounting?${params}`);
  if (!res.ok) throw new Error("Failed to load accounting data");
  return res.json();
}

export type AccountingTab = "overview" | "profit-loss" | "schedule-c" | "tax-calendar" | "year-end" | "benchmarks" | "business-trips" | "investments";

function getInitialTab(): AccountingTab {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "profit-loss" || tab === "schedule-c" || tab === "tax-calendar" || tab === "year-end" || tab === "benchmarks" || tab === "business-trips" || tab === "investments") return tab;
  return "overview";
}

function getInitialYear(currentYear: number): number {
  const params = new URLSearchParams(window.location.search);
  const y = parseInt(params.get("year") ?? "", 10);
  if (!isNaN(y) && y >= 2000 && y <= currentYear + 1) return y;
  return currentYear;
}

function TabSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function Accounting() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(() => getInitialYear(currentYear));
  const [activeTab, setActiveTab] = useState<AccountingTab>(getInitialTab);
  const defaultYears = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const years = defaultYears.includes(year) ? defaultYears : [year, ...defaultYears].sort((a, b) => b - a);
  const { isOwner } = useUserPermissions();
  const { activeBusiness } = useBusiness();
  const bizSlug = activeBusiness?.slug;

  const { data, isLoading, error } = useQuery({
    queryKey: ["accounting", year, bizSlug ?? "all"],
    queryFn: () => fetchAccounting(year, bizSlug),
    staleTime: 1000 * 60 * 2,
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Accounting & Tax</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Financial overview, Schedule C, and filing calendar.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {[
          { key: "overview" as const,        label: "Overview",                     icon: BarChart3 },
          { key: "profit-loss" as const,   label: "Profit & Loss",                icon: TrendingUp },
          { key: "schedule-c" as const,    label: "Schedule C + Home Office",     icon: FileText },
          { key: "tax-calendar" as const,  label: "Tax Calendar & Compliance",    icon: Calendar },
          { key: "business-trips" as const, label: "Business Trips",              icon: Briefcase },
          { key: "investments" as const,   label: "Investments",                  icon: PiggyBank },
          { key: "benchmarks" as const,    label: "Benchmarks",                   icon: BarChart2 },
          ...(isOwner ? [{ key: "year-end" as const,   label: "Year-End Report",  icon: FileSpreadsheet }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${
              activeTab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <>
          {isLoading && <div className="text-center py-20 text-muted-foreground animate-pulse">Loading {year} report…</div>}
          {error && <div className="text-center py-20 text-destructive">Failed to load report. Check that the API is running.</div>}
          {data && (
            <ErrorBoundary>
              <Suspense fallback={<TabSpinner />}>
                <OverviewTab data={data} year={year} setActiveTab={setActiveTab} />
              </Suspense>
            </ErrorBoundary>
          )}
        </>
      )}

      {activeTab === "profit-loss" && (
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <ProfitLossTab year={year} />
          </Suspense>
        </ErrorBoundary>
      )}

      {activeTab === "schedule-c" && (
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <ScheduleCTab year={year} />
          </Suspense>
        </ErrorBoundary>
      )}

      {activeTab === "tax-calendar" && (
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <TaxCalendarTab year={year} />
          </Suspense>
        </ErrorBoundary>
      )}

      {activeTab === "year-end" && isOwner && (
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <YearEndReportTab year={year} />
          </Suspense>
        </ErrorBoundary>
      )}

      {activeTab === "benchmarks" && (
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <BenchmarksTab />
          </Suspense>
        </ErrorBoundary>
      )}

      {activeTab === "business-trips" && (
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <BusinessTripsTab year={year} />
          </Suspense>
        </ErrorBoundary>
      )}

      {activeTab === "investments" && (
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <InvestmentsTab />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
