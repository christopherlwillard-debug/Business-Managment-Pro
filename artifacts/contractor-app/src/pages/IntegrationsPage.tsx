import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, KeyRound, AlertTriangle, Shield, CheckCircle2, XCircle,
  Zap, Link2, Settings, ChevronRight, Loader2, ListChecks,
  Globe, Activity, Lock,
} from "lucide-react";
import IntegrationCard, { type IntegrationStatus } from "./integrations/IntegrationCard";
import { useBusiness } from "@/contexts/BusinessContext";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = "overview" | "procurement" | "procurement_auto" | "procurement_portal" | "financial" | "ai" | "contractor_portal" | "equipment";

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode; categories: string[] }> = [
  {
    id: "overview",
    label: "Overview",
    icon: <Activity className="w-3.5 h-3.5" />,
    categories: [], // special — shows health summary + issues
  },
  {
    id: "procurement",
    label: "Procurement",
    icon: <Zap className="w-3.5 h-3.5" />,
    categories: ["procurement", "procurement_auto", "procurement_portal"],
  },
  {
    id: "contractor_portal",
    label: "Portals",
    icon: <Link2 className="w-3.5 h-3.5" />,
    categories: ["contractor_portal"],
  },
  {
    id: "financial",
    label: "Financial",
    icon: <Lock className="w-3.5 h-3.5" />,
    categories: ["financial"],
  },
  {
    id: "ai",
    label: "AI & Comms",
    icon: <Settings className="w-3.5 h-3.5" />,
    categories: ["ai", "communication"],
  },
  {
    id: "equipment",
    label: "Equipment",
    icon: <Globe className="w-3.5 h-3.5" />,
    categories: ["equipment"],
  },
];

// ── Procurement sub-section labels ───────────────────────────────────────────

const PROCUREMENT_SECTIONS: Array<{ category: string; label: string; description: string }> = [
  {
    category:    "procurement",
    label:       "API Integrations",
    description: "Credential-based API connections for federal and state bid discovery.",
  },
  {
    category:    "procurement_auto",
    label:       "Auto-Synced Public Sources",
    description: "Public data feeds that sync automatically — no credential required. Status reflects actual sync health.",
  },
  {
    category:    "procurement_portal",
    label:       "Procurement Portals",
    description: "Bid portals requiring a manual account. Store logins here for quick access.",
  },
];

// ── Health summary helpers ────────────────────────────────────────────────────

type HealthData = {
  summary: {
    total: number;
    connected: number;
    needsAttention: number;
    notConfigured: number;
    expiringCount: number;
  };
  integrations: IntegrationStatus[];
};

function HealthSummaryBar({ data }: { data: HealthData }) {
  const { summary } = data;
  const pctConnected = summary.total ? Math.round((summary.connected / summary.total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        {
          label: "Connected",
          value: summary.connected,
          color: "text-green-600 dark:text-green-400",
          bg:    "bg-green-50 dark:bg-green-900/20",
          dot:   "bg-green-500",
        },
        {
          label: "Needs Attention",
          value: summary.needsAttention,
          color: "text-red-600 dark:text-red-400",
          bg:    "bg-red-50 dark:bg-red-900/20",
          dot:   "bg-red-500",
        },
        {
          label: "Expiring Soon",
          value: summary.expiringCount,
          color: "text-yellow-600 dark:text-yellow-400",
          bg:    "bg-yellow-50 dark:bg-yellow-900/20",
          dot:   "bg-yellow-400",
        },
        {
          label: "Not Configured",
          value: summary.notConfigured,
          color: "text-muted-foreground",
          bg:    "bg-muted/40",
          dot:   "bg-muted-foreground/30",
        },
      ].map(item => (
        <div key={item.label} className={cn("rounded-xl p-3 flex items-center gap-3 border border-transparent", item.bg)}>
          <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", item.dot)} />
          <div>
            <div className={cn("text-xl font-bold leading-none", item.color)}>{item.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function IssuesPanel({ integrations, onTabSwitch }: { integrations: IntegrationStatus[]; onTabSwitch: (tab: Tab) => void }) {
  const issues = integrations.filter(i =>
    ["invalid", "sync_error"].includes(i.effectiveStatus) ||
    (i.expiresAt && Math.ceil((new Date(i.expiresAt).getTime() - Date.now()) / 86_400_000) <= (i.renewalPeriodDays ?? 30) &&
      Math.ceil((new Date(i.expiresAt).getTime() - Date.now()) / 86_400_000) > 0)
  );

  if (issues.length === 0) return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
      <span className="text-sm text-green-700 dark:text-green-300 font-medium">All integrations are healthy.</span>
    </div>
  );

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        Issues Needing Attention
      </h3>
      {issues.map(i => {
        const isExpiring = i.expiresAt && Math.ceil((new Date(i.expiresAt).getTime() - Date.now()) / 86_400_000) <= (i.renewalPeriodDays ?? 30);
        const daysLeft   = i.expiresAt ? Math.ceil((new Date(i.expiresAt).getTime() - Date.now()) / 86_400_000) : null;
        return (
          <div key={i.slug} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            {i.effectiveStatus === "sync_error" || i.effectiveStatus === "invalid"
              ? <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            }
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{i.shortName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {i.effectiveStatus === "invalid"     ? (i.lastVerifyError ?? "Credential rejected") :
                 i.effectiveStatus === "sync_error"  ? (i.syncHealth?.lastSyncError ?? "Sync failed") :
                 isExpiring && daysLeft !== null      ? `Key expires in ${daysLeft} day(s)` : ""}
              </div>
            </div>
            <button
              onClick={() => {
                const tab = TABS.find(t => t.categories.includes(i.category));
                if (tab) onTabSwitch(tab.id);
              }}
              className="text-xs text-primary hover:underline flex items-center gap-0.5 flex-shrink-0"
            >
              Fix <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Health task creator ───────────────────────────────────────────────────────

function CreateTasksButton({ businessId }: { businessId?: number }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/integrations/health/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json() as { ok: boolean; tasksCreated: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-tasks"] }),
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={!businessId || mutation.isPending}
      title={!businessId ? "Select a business first" : "Create dashboard tasks for integration issues"}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
        "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      {mutation.isPending
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <ListChecks className="w-3 h-3" />
      }
      {mutation.isPending ? "Creating tasks…"
       : mutation.isSuccess ? `${mutation.data?.tasksCreated ?? 0} task(s) created`
       : "Create to-do tasks for issues"
      }
    </button>
  );
}

// ── Integration group rendering ───────────────────────────────────────────────

function IntegrationSection({
  label, description, items, onUpdated, businessId,
}: {
  label: string;
  description: string;
  items: IntegrationStatus[];
  onUpdated: () => void;
  businessId: number | null;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2.5">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">
        {items.map(integration => (
          <IntegrationCard key={`${businessId ?? "platform"}-${integration.slug}`} integration={integration} onUpdated={onUpdated} />
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { activeBusiness } = useBusiness();

  const { data: healthData, isLoading, error } = useQuery<HealthData>({
    queryKey: ["integrations-health", activeBusiness?.id ?? null],
    queryFn: async () => {
      const businessQuery = activeBusiness?.id ? `?businessId=${activeBusiness.id}` : "";
      const res = await fetch(`${BASE_URL}/api/integrations/health${businessQuery}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load integrations");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  function handleUpdated() {
    queryClient.invalidateQueries({ queryKey: ["integrations-health"] });
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
  }

  const integrations = healthData?.integrations ?? [];

  function getTabItems(tab: Tab): IntegrationStatus[] {
    if (tab === "overview") return integrations;
    const tabDef = TABS.find(t => t.id === tab);
    if (!tabDef) return [];
    return integrations.filter(i => tabDef.categories.includes(i.category));
  }

  // Count issues per tab for badge
  function countTabIssues(categories: string[]): number {
    return integrations.filter(i =>
      (categories.length === 0 || categories.includes(i.category)) &&
      ["invalid", "sync_error"].includes(i.effectiveStatus)
    ).length;
  }

  const currentTabItems = getTabItems(activeTab);

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold text-foreground">Integrations & Credentials</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Manage API keys, portal logins, and automated data connections. Credentials are encrypted — only hints are shown here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateTasksButton businessId={activeBusiness?.id} />
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["integrations-health"] })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Security notice ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground">
        <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary/60" />
        <div>
          <span className="font-medium text-foreground">Credential security: </span>
          All credentials are stored AES-256-GCM encrypted. Only the last 4 characters of a key or a masked username are ever shown. Full credentials are never logged, never returned from the API, and never sent to AI services.
        </div>
      </div>

      {/* ── Loading / error ───────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Failed to load integrations. Check that the API server is running.
        </div>
      )}

      {!isLoading && !error && healthData && (
        <>
          {/* ── Health summary ───────────────────────────────────────────────── */}
          <HealthSummaryBar data={healthData} />

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <div className="flex gap-0.5 overflow-x-auto border-b border-border pb-0 -mb-px">
            {TABS.map(tab => {
              const issueCount = countTabIssues(tab.categories);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap",
                    activeTab === tab.id
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                  {issueCount > 0 && (
                    <span className="ml-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-red-500 text-white">
                      {issueCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Tab content ──────────────────────────────────────────────────── */}
          <div className="space-y-6 pt-1">

            {/* OVERVIEW tab */}
            {activeTab === "overview" && (
              <>
                <IssuesPanel integrations={integrations} onTabSwitch={setActiveTab} />

                {/* Quick summary of each category */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">All Systems</h3>
                  {TABS.filter(t => t.id !== "overview").map(tab => {
                    const items = getTabItems(tab.id);
                    const connected = items.filter(i =>
                      ["active", "env_only", "managed", "syncing", "portal_saved", "portal_configured"].includes(i.effectiveStatus)
                    ).length;
                    const issues = items.filter(i => ["invalid", "sync_error"].includes(i.effectiveStatus)).length;
                    if (items.length === 0) return null;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-muted-foreground">{tab.icon}</span>
                          <span className="text-sm font-medium text-foreground">{tab.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {connected}/{items.length} connected
                          </span>
                        </div>
                        {issues > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            {issues} issue{issues > 1 ? "s" : ""}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>

                {/* Platform credential scope note */}
                <div className="text-xs text-muted-foreground border-t border-border pt-4 space-y-1">
                  <p className="font-medium text-foreground">Platform vs. business credentials</p>
                  <p>
                    Most API keys (SAM.gov, EIA, Google Maps) are <strong>platform-wide</strong> — one key covers all businesses.
                    Portal logins (contractor portals, equipment auctions) are per-business — GC and Asphalt Sealing can have different accounts.
                    Individual Plaid bank links are managed from the Banking page under each business.
                  </p>
                </div>
              </>
            )}

            {/* PROCUREMENT tab — three sub-sections */}
            {activeTab === "procurement" && (
              <div className="space-y-8">
                {PROCUREMENT_SECTIONS.map(section => {
                  const items = integrations.filter(i => i.category === section.category);
                  return (
                    <IntegrationSection
                      key={section.category}
                      label={section.label}
                      description={section.description}
                      items={items}
                      onUpdated={handleUpdated}
                  businessId={activeBusiness?.id ?? null}
                      businessId={activeBusiness?.id ?? null}
                    />
                  );
                })}

                {/* Link to SourceManagementPanel */}
                <div className="px-4 py-3 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Per-business source enabling</span>
                  {" "}— toggle individual procurement sources on/off for each business from the{" "}
                  <a href="../bids" className="text-primary hover:underline">Bid Opportunities</a>
                  {" "}page → Sources tab. This page manages the credentials and API keys those sources need.
                </div>
              </div>
            )}

            {/* PORTALS tab */}
            {activeTab === "contractor_portal" && (
              <div className="space-y-6">
                <IntegrationSection
                  label="Supply & Material Portals"
                  description="Contractor accounts at supply, lumber, and materials distributors. Credentials stored encrypted for quick access. Per-business — GC and Asphalt Sealing can have separate accounts."
                  items={currentTabItems.filter(i => !i.comingSoon)}
                  onUpdated={handleUpdated}
                  businessId={activeBusiness?.id ?? null}
                />
                {currentTabItems.filter(i => i.comingSoon).length > 0 && (
                  <IntegrationSection
                    label="Coming Soon"
                    description="Additional portal integrations planned for future releases."
                    items={currentTabItems.filter(i => i.comingSoon)}
                    onUpdated={handleUpdated}
                  businessId={activeBusiness?.id ?? null}
                  />
                )}

                {/* Note about Quick Links */}
                <div className="px-4 py-3 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Custom portal links</span>
                  {" "}— save any portal URL (with optional username/password) from the{" "}
                  <a href="../bids" className="text-primary hover:underline">Bid Opportunities</a>
                  {" "}page → Quick Links panel. Those links are per-business and separate from the catalog portals above.
                </div>
              </div>
            )}

            {/* FINANCIAL tab */}
            {activeTab === "financial" && (
              <IntegrationSection
                label="Financial Integrations"
                description="Banking connections and financial data. Plaid credentials are platform-wide; individual bank account links are per-business from the Banking page."
                items={currentTabItems}
                onUpdated={handleUpdated}
                  businessId={activeBusiness?.id ?? null}
              />
            )}

            {/* AI & COMMS tab */}
            {activeTab === "ai" && (
              <div className="space-y-6">
                <IntegrationSection
                  label="AI & Intelligence"
                  description="AI inference services for bid analysis and summaries. Managed through Replit's AI proxy — no manual key management needed."
                  items={currentTabItems.filter(i => i.category === "ai")}
                  onUpdated={handleUpdated}
                  businessId={activeBusiness?.id ?? null}
                />
                <IntegrationSection
                  label="Fuel & Maps"
                  description="Mapping, geocoding, and fuel price data for mileage tracking and route planning."
                  items={integrations.filter(i => i.category === "fuel_maps")}
                  onUpdated={handleUpdated}
                  businessId={activeBusiness?.id ?? null}
                />
                <IntegrationSection
                  label="Communication"
                  description="Email notification channels for invoices, compliance alerts, and bid updates."
                  items={currentTabItems.filter(i => i.category === "communication")}
                  onUpdated={handleUpdated}
                  businessId={activeBusiness?.id ?? null}
                />
              </div>
            )}

            {/* EQUIPMENT tab */}
            {activeTab === "equipment" && (
              <div className="space-y-6">
                <IntegrationSection
                  label="Equipment & Auction Portals"
                  description="Government surplus and commercial equipment auction portals. Store your bidder account logins for quick access during live auctions. See My Equipment for inventory management."
                  items={currentTabItems}
                  onUpdated={handleUpdated}
                  businessId={activeBusiness?.id ?? null}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
